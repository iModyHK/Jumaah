import type { Db, Prisma } from '@jumaah/db';
import { estimateSeconds, paragraphHash, splitIntoParagraphs, toHijri, type SectionType } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';
import type { Actor } from '../lib/audit.js';
import { audit, outbox } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { notifyKhutbahChanged } from './session.service.js';

export const FULL_INCLUDE = {
  sections: {
    orderBy: { order: 'asc' as const },
    include: { paragraphs: { orderBy: { order: 'asc' as const }, include: { translations: true } } },
  },
};

export async function getKhutbahOrThrow(db: Db, tenantId: string, id: string) {
  const k = await db.khutbah.findFirst({ where: { id, tenantId, deletedAt: null }, include: FULL_INCLUDE });
  if (!k) throw notFound('Khutbah');
  return k;
}

interface ParagraphInput {
  text: string;
  kind?: 'TEXT' | 'QURAN' | 'HADITH';
  reference?: string | null;
  estimatedSeconds?: number;
}

export function paragraphsFromInput(input: { rawText?: string; paragraphs?: ParagraphInput[] }, wpm?: number): ParagraphInput[] {
  if (input.paragraphs?.length) return input.paragraphs;
  if (input.rawText) return splitIntoParagraphs(input.rawText).map((p) => ({ text: p.text, kind: p.kind, reference: p.reference ?? null }));
  return [];
}

async function wpmOf(db: Db, tenantId: string): Promise<number | undefined> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return (t?.settings as { wordsPerMinute?: number })?.wordsPerMinute;
}

export async function createParagraphRows(
  db: Db,
  tenantId: string,
  sectionId: string,
  paragraphs: ParagraphInput[],
  wpm?: number,
  startOrder = 0,
) {
  const rows = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const row = await db.paragraph.create({
      data: {
        sectionId,
        tenantId,
        order: startOrder + i,
        kind: p.kind ?? 'TEXT',
        reference: p.reference ?? null,
        textAr: p.text.trim(),
        hash: paragraphHash(p.text),
        estimatedSeconds: p.estimatedSeconds ?? estimateSeconds(p.text, wpm),
      },
    });
    await outbox(db, tenantId, 'Paragraph', row.id, 'UPSERT', row);
    rows.push(row);
  }
  return rows;
}

export async function createKhutbah(
  ctx: AppContext,
  tenantId: string,
  input: {
    title: string;
    gregorianDate: string;
    hijriDate?: string;
    imamName?: string;
    targetLanguages?: string[];
    notes?: string;
    sections?: Array<{ type: SectionType; rawText?: string; paragraphs?: ParagraphInput[] }>;
  },
  actor: Actor,
) {
  const date = new Date(input.gregorianDate);
  if (Number.isNaN(date.getTime())) throw badRequest('Invalid date');
  const wpm = await wpmOf(ctx.db, tenantId);
  let langs = input.targetLanguages;
  if (!langs) {
    const tl = await ctx.db.tenantLanguage.findMany({ where: { tenantId, enabled: true }, orderBy: { order: 'asc' } });
    langs = tl.map((l) => l.code);
  }
  const khutbah = await ctx.db.$transaction(async (tx) => {
    const k = await tx.khutbah.create({
      data: {
        tenantId,
        title: input.title,
        gregorianDate: date,
        hijriDate: input.hijriDate ?? toHijri(date).formatted,
        imamName: input.imamName ?? null,
        targetLanguages: langs!,
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });
    const types: SectionType[] = ['FIRST', 'SECOND', 'DUA'];
    for (let i = 0; i < types.length; i++) {
      const s = await tx.khutbahSection.create({ data: { khutbahId: k.id, tenantId, type: types[i], order: i } });
      await outbox(tx, tenantId, 'KhutbahSection', s.id, 'UPSERT', s);
      const provided = input.sections?.find((x) => x.type === types[i]);
      if (provided) await createParagraphRows(tx, tenantId, s.id, paragraphsFromInput(provided), wpm);
    }
    await outbox(tx, tenantId, 'Khutbah', k.id, 'UPSERT', k);
    await snapshotVersion(tx, tenantId, k.id, 'Created', actor.id);
    return k;
  });
  await audit(ctx.db, tenantId, actor, 'khutbah.create', 'Khutbah', khutbah.id, null, { title: khutbah.title });
  return getKhutbahOrThrow(ctx.db, tenantId, khutbah.id);
}

/** Store a full snapshot of the Arabic text + translations as a numbered version. */
export async function snapshotVersion(db: Db, tenantId: string, khutbahId: string, changeNote: string | undefined, userId: string | null) {
  const k = await db.khutbah.findUniqueOrThrow({ where: { id: khutbahId }, include: FULL_INCLUDE });
  const last = await db.khutbahVersion.findFirst({ where: { khutbahId }, orderBy: { version: 'desc' } });
  const version = (last?.version ?? 0) + 1;
  const snapshot = {
    title: k.title,
    targetLanguages: k.targetLanguages,
    sections: k.sections.map((s) => ({
      type: s.type,
      paragraphs: s.paragraphs.map((p) => ({
        textAr: p.textAr,
        kind: p.kind,
        reference: p.reference,
        estimatedSeconds: p.estimatedSeconds,
        translations: p.translations.map((t) => ({ lang: t.lang, text: t.text, status: t.status })),
      })),
    })),
  };
  const row = await db.khutbahVersion.create({
    data: { khutbahId, tenantId, version, changeNote: changeNote ?? null, createdById: userId, snapshot: snapshot as Prisma.InputJsonValue },
  });
  await db.khutbah.update({ where: { id: khutbahId }, data: { version } });
  await outbox(db, tenantId, 'KhutbahVersion', row.id, 'UPSERT', row);
  return row;
}

/**
 * Replace a section's Arabic text. Paragraphs whose normalized hash is unchanged keep their translations
 * (matched in order of appearance); everything else is recreated with PENDING translations.
 */
export async function replaceSectionText(
  ctx: AppContext,
  tenantId: string,
  khutbahId: string,
  type: SectionType,
  rawText: string,
  actor: Actor,
  changeNote?: string,
) {
  const k = await getKhutbahOrThrow(ctx.db, tenantId, khutbahId);
  const section = k.sections.find((s) => s.type === type);
  if (!section) throw notFound('Section');
  const wpm = await wpmOf(ctx.db, tenantId);
  const incoming = splitIntoParagraphs(rawText);
  await ctx.db.$transaction(async (tx) => {
    const oldByHash = new Map<string, typeof section.paragraphs>();
    for (const p of section.paragraphs) oldByHash.set(p.hash, [...(oldByHash.get(p.hash) ?? []), p]);
    const keptIds = new Set<string>();
    for (let i = 0; i < incoming.length; i++) {
      const inc = incoming[i];
      const hash = paragraphHash(inc.text);
      const reuse = oldByHash.get(hash)?.shift();
      if (reuse) {
        keptIds.add(reuse.id);
        const row = await tx.paragraph.update({
          where: { id: reuse.id },
          data: { order: i, textAr: inc.text, kind: reuse.kind === 'TEXT' ? inc.kind : reuse.kind, reference: reuse.reference ?? inc.reference ?? null },
        });
        await outbox(tx, tenantId, 'Paragraph', row.id, 'UPSERT', row);
      } else {
        const [row] = await createParagraphRows(tx, tenantId, section.id, [{ text: inc.text, kind: inc.kind, reference: inc.reference ?? null }], wpm, i);
        keptIds.add(row.id);
      }
    }
    for (const old of section.paragraphs) {
      if (!keptIds.has(old.id)) {
        await tx.paragraph.delete({ where: { id: old.id } });
        await outbox(tx, tenantId, 'Paragraph', old.id, 'DELETE', { id: old.id });
      }
    }
    await snapshotVersion(tx, tenantId, khutbahId, changeNote ?? `Edited ${type}`, actor.id);
  });
  await audit(ctx.db, tenantId, actor, 'khutbah.section.replace', 'KhutbahSection', section.id, { paragraphs: section.paragraphs.length }, { paragraphs: incoming.length });
  await notifyKhutbahChanged(ctx, tenantId, khutbahId);
  return getKhutbahOrThrow(ctx.db, tenantId, khutbahId);
}

async function paragraphOrThrow(db: Db, tenantId: string, id: string) {
  const p = await db.paragraph.findFirst({ where: { id, tenantId }, include: { section: true, translations: true } });
  if (!p) throw notFound('Paragraph');
  return p;
}

export async function updateParagraph(
  ctx: AppContext,
  tenantId: string,
  id: string,
  input: { text?: string; kind?: 'TEXT' | 'QURAN' | 'HADITH'; reference?: string | null; estimatedSeconds?: number },
  actor: Actor,
) {
  const p = await paragraphOrThrow(ctx.db, tenantId, id);
  const textChanged = input.text !== undefined && paragraphHash(input.text) !== p.hash;
  const wpm = await wpmOf(ctx.db, tenantId);
  const row = await ctx.db.$transaction(async (tx) => {
    const updated = await tx.paragraph.update({
      where: { id },
      data: {
        textAr: input.text?.trim() ?? p.textAr,
        hash: input.text ? paragraphHash(input.text) : p.hash,
        kind: input.kind ?? p.kind,
        reference: input.reference === undefined ? p.reference : input.reference,
        estimatedSeconds: input.estimatedSeconds ?? (textChanged ? estimateSeconds(input.text!, wpm) : p.estimatedSeconds),
      },
    });
    await outbox(tx, tenantId, 'Paragraph', updated.id, 'UPSERT', updated);
    if (textChanged) {
      // Source changed: existing translations are no longer trustworthy → back to PENDING (kept as history).
      for (const t of p.translations) {
        const nt = await tx.translation.update({ where: { id: t.id }, data: { status: 'PENDING', approvedById: null, reviewedById: null, version: { increment: 1 } } });
        await tx.translationVersion.create({ data: { translationId: t.id, tenantId, version: nt.version, text: nt.text, status: 'PENDING', providerType: nt.providerType, changedById: actor.id } });
        await outbox(tx, tenantId, 'Translation', nt.id, 'UPSERT', nt, nt.version);
      }
      await snapshotVersion(tx, tenantId, p.section.khutbahId, 'Paragraph edited', actor.id);
    }
    return updated;
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.update', 'Paragraph', id, { textAr: p.textAr, kind: p.kind }, { textAr: row.textAr, kind: row.kind });
  await notifyKhutbahChanged(ctx, tenantId, p.section.khutbahId);
  return row;
}

export async function splitParagraph(ctx: AppContext, tenantId: string, id: string, offset: number, actor: Actor) {
  const p = await paragraphOrThrow(ctx.db, tenantId, id);
  const a = p.textAr.slice(0, offset).trim();
  const b = p.textAr.slice(offset).trim();
  if (!a || !b) throw badRequest('Split offset must leave text on both sides');
  const wpm = await wpmOf(ctx.db, tenantId);
  await ctx.db.$transaction(async (tx) => {
    await tx.paragraph.updateMany({ where: { sectionId: p.sectionId, order: { gt: p.order } }, data: { order: { increment: 1 } } });
    const first = await tx.paragraph.update({ where: { id }, data: { textAr: a, hash: paragraphHash(a), estimatedSeconds: estimateSeconds(a, wpm) } });
    await outbox(tx, tenantId, 'Paragraph', first.id, 'UPSERT', first);
    for (const t of p.translations) {
      const nt = await tx.translation.update({ where: { id: t.id }, data: { status: 'PENDING', approvedById: null, reviewedById: null, version: { increment: 1 } } });
      await outbox(tx, tenantId, 'Translation', nt.id, 'UPSERT', nt, nt.version);
    }
    await createParagraphRows(tx, tenantId, p.sectionId, [{ text: b, kind: 'TEXT' }], wpm, p.order + 1);
    await snapshotVersion(tx, tenantId, p.section.khutbahId, 'Paragraph split', actor.id);
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.split', 'Paragraph', id, null, { offset });
  await notifyKhutbahChanged(ctx, tenantId, p.section.khutbahId);
  return getKhutbahOrThrow(ctx.db, tenantId, p.section.khutbahId);
}

export async function mergeParagraph(ctx: AppContext, tenantId: string, id: string, withNextId: string, actor: Actor) {
  const p = await paragraphOrThrow(ctx.db, tenantId, id);
  const n = await paragraphOrThrow(ctx.db, tenantId, withNextId);
  if (n.sectionId !== p.sectionId || n.order !== p.order + 1) throw badRequest('Can only merge with the immediately following paragraph');
  const wpm = await wpmOf(ctx.db, tenantId);
  const text = `${p.textAr} ${n.textAr}`.replace(/\s+/g, ' ').trim();
  await ctx.db.$transaction(async (tx) => {
    const row = await tx.paragraph.update({
      where: { id },
      data: { textAr: text, hash: paragraphHash(text), estimatedSeconds: estimateSeconds(text, wpm), kind: p.kind !== 'TEXT' ? p.kind : n.kind, reference: p.reference ?? n.reference },
    });
    await outbox(tx, tenantId, 'Paragraph', row.id, 'UPSERT', row);
    for (const t of p.translations) {
      const other = n.translations.find((x) => x.lang === t.lang);
      const merged = other ? `${t.text} ${other.text}` : t.text;
      const nt = await tx.translation.update({ where: { id: t.id }, data: { text: merged, status: 'PENDING', approvedById: null, reviewedById: null, version: { increment: 1 } } });
      await outbox(tx, tenantId, 'Translation', nt.id, 'UPSERT', nt, nt.version);
    }
    await tx.paragraph.delete({ where: { id: withNextId } });
    await outbox(tx, tenantId, 'Paragraph', withNextId, 'DELETE', { id: withNextId });
    await tx.paragraph.updateMany({ where: { sectionId: p.sectionId, order: { gt: n.order } }, data: { order: { decrement: 1 } } });
    await snapshotVersion(tx, tenantId, p.section.khutbahId, 'Paragraphs merged', actor.id);
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.merge', 'Paragraph', id, null, { withNextId });
  await notifyKhutbahChanged(ctx, tenantId, p.section.khutbahId);
  return getKhutbahOrThrow(ctx.db, tenantId, p.section.khutbahId);
}

export async function deleteParagraph(ctx: AppContext, tenantId: string, id: string, actor: Actor) {
  const p = await paragraphOrThrow(ctx.db, tenantId, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.paragraph.delete({ where: { id } });
    await outbox(tx, tenantId, 'Paragraph', id, 'DELETE', { id });
    await tx.paragraph.updateMany({ where: { sectionId: p.sectionId, order: { gt: p.order } }, data: { order: { decrement: 1 } } });
    await snapshotVersion(tx, tenantId, p.section.khutbahId, 'Paragraph deleted', actor.id);
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.delete', 'Paragraph', id, { textAr: p.textAr }, null);
  await notifyKhutbahChanged(ctx, tenantId, p.section.khutbahId);
}

export async function addParagraph(ctx: AppContext, tenantId: string, sectionId: string, input: ParagraphInput & { afterId?: string }, actor: Actor) {
  const section = await ctx.db.khutbahSection.findFirst({ where: { id: sectionId, tenantId }, include: { paragraphs: true } });
  if (!section) throw notFound('Section');
  const wpm = await wpmOf(ctx.db, tenantId);
  const after = input.afterId ? section.paragraphs.find((p) => p.id === input.afterId) : null;
  const order = after ? after.order + 1 : section.paragraphs.length;
  const [row] = await ctx.db.$transaction(async (tx) => {
    await tx.paragraph.updateMany({ where: { sectionId, order: { gte: order } }, data: { order: { increment: 1 } } });
    const rows = await createParagraphRows(tx, tenantId, sectionId, [input], wpm, order);
    await snapshotVersion(tx, tenantId, section.khutbahId, 'Paragraph added', actor.id);
    return rows;
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.add', 'Paragraph', row.id, null, { textAr: row.textAr });
  await notifyKhutbahChanged(ctx, tenantId, section.khutbahId);
  return row;
}

export async function reorderParagraphs(ctx: AppContext, tenantId: string, sectionId: string, orderedIds: string[], actor: Actor) {
  const section = await ctx.db.khutbahSection.findFirst({ where: { id: sectionId, tenantId }, include: { paragraphs: true } });
  if (!section) throw notFound('Section');
  const ids = new Set(section.paragraphs.map((p) => p.id));
  if (orderedIds.length !== ids.size || !orderedIds.every((id) => ids.has(id))) throw badRequest('orderedIds must contain every paragraph of the section exactly once');
  await ctx.db.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const row = await tx.paragraph.update({ where: { id: orderedIds[i] }, data: { order: i } });
      await outbox(tx, tenantId, 'Paragraph', row.id, 'UPSERT', row);
    }
  });
  await audit(ctx.db, tenantId, actor, 'paragraph.reorder', 'KhutbahSection', sectionId, null, { orderedIds });
  await notifyKhutbahChanged(ctx, tenantId, section.khutbahId);
  return getKhutbahOrThrow(ctx.db, tenantId, section.khutbahId);
}

export async function copyKhutbah(
  ctx: AppContext,
  tenantId: string,
  sourceId: string,
  input: { title?: string; gregorianDate?: string; includeTranslations: boolean },
  actor: Actor,
  targetTenantId = tenantId,
) {
  const src = await getKhutbahOrThrow(ctx.db, tenantId, sourceId);
  const date = input.gregorianDate ? new Date(input.gregorianDate) : new Date(src.gregorianDate.getTime() + 7 * 86400000);
  const copy = await ctx.db.$transaction(async (tx) => {
    const k = await tx.khutbah.create({
      data: {
        tenantId: targetTenantId,
        title: input.title ?? src.title,
        gregorianDate: date,
        hijriDate: toHijri(date).formatted,
        imamName: src.imamName,
        targetLanguages: src.targetLanguages,
        notes: src.notes,
        copiedFromId: src.id,
        createdById: actor.id,
        status: 'DRAFT',
      },
    });
    await outbox(tx, targetTenantId, 'Khutbah', k.id, 'UPSERT', k);
    for (const s of src.sections) {
      const ns = await tx.khutbahSection.create({ data: { khutbahId: k.id, tenantId: targetTenantId, type: s.type, order: s.order } });
      await outbox(tx, targetTenantId, 'KhutbahSection', ns.id, 'UPSERT', ns);
      for (const p of s.paragraphs) {
        const np = await tx.paragraph.create({
          data: { sectionId: ns.id, tenantId: targetTenantId, order: p.order, kind: p.kind, reference: p.reference, textAr: p.textAr, hash: p.hash, estimatedSeconds: p.estimatedSeconds },
        });
        await outbox(tx, targetTenantId, 'Paragraph', np.id, 'UPSERT', np);
        if (input.includeTranslations) {
          for (const t of p.translations) {
            const nt = await tx.translation.create({
              data: { paragraphId: np.id, tenantId: targetTenantId, lang: t.lang, text: t.text, status: t.status === 'APPROVED' ? 'REVIEWED' : t.status, providerType: t.providerType },
            });
            await outbox(tx, targetTenantId, 'Translation', nt.id, 'UPSERT', nt);
          }
        }
      }
    }
    await snapshotVersion(tx, targetTenantId, k.id, `Copied from ${src.title}`, actor.id);
    return k;
  });
  await audit(ctx.db, targetTenantId, actor, 'khutbah.copy', 'Khutbah', copy.id, null, { sourceId });
  return getKhutbahOrThrow(ctx.db, targetTenantId, copy.id);
}

export async function restoreVersion(ctx: AppContext, tenantId: string, khutbahId: string, version: number, actor: Actor) {
  const v = await ctx.db.khutbahVersion.findFirst({ where: { khutbahId, tenantId, version } });
  if (!v) throw notFound('Version');
  const snap = v.snapshot as {
    title: string;
    sections: Array<{ type: SectionType; paragraphs: Array<{ textAr: string; kind: 'TEXT' | 'QURAN' | 'HADITH'; reference: string | null; estimatedSeconds: number; translations: Array<{ lang: string; text: string; status: string }> }> }>;
  };
  const k = await getKhutbahOrThrow(ctx.db, tenantId, khutbahId);
  await ctx.db.$transaction(async (tx) => {
    for (const s of k.sections) {
      for (const p of s.paragraphs) {
        await tx.paragraph.delete({ where: { id: p.id } });
        await outbox(tx, tenantId, 'Paragraph', p.id, 'DELETE', { id: p.id });
      }
      const from = snap.sections.find((x) => x.type === s.type);
      for (let i = 0; i < (from?.paragraphs.length ?? 0); i++) {
        const sp = from!.paragraphs[i];
        const [np] = await createParagraphRows(tx, tenantId, s.id, [{ text: sp.textAr, kind: sp.kind, reference: sp.reference, estimatedSeconds: sp.estimatedSeconds }], undefined, i);
        for (const t of sp.translations) {
          const nt = await tx.translation.create({ data: { paragraphId: np.id, tenantId, lang: t.lang, text: t.text, status: t.status as never, providerType: 'MANUAL' } });
          await outbox(tx, tenantId, 'Translation', nt.id, 'UPSERT', nt);
        }
      }
    }
    await tx.khutbah.update({ where: { id: khutbahId }, data: { title: snap.title } });
    await snapshotVersion(tx, tenantId, khutbahId, `Restored version ${version}`, actor.id);
  });
  await audit(ctx.db, tenantId, actor, 'khutbah.restore', 'Khutbah', khutbahId, null, { version });
  await notifyKhutbahChanged(ctx, tenantId, khutbahId);
  return getKhutbahOrThrow(ctx.db, tenantId, khutbahId);
}
