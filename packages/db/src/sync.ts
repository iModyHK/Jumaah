import type { Prisma, PrismaClient } from '@prisma/client';

export interface SyncEntry {
  id: string;
  entity: string;
  entityId: string;
  op: 'UPSERT' | 'DELETE';
  payload: Record<string, unknown>;
  version: number;
  occurredAt: string;
}

export interface ApplyResult {
  applied: number;
  skipped: number;
  conflicts: number;
  errors: Array<{ id: string; error: string }>;
}

const ORDER = ['Tenant', 'TenantLanguage', 'Khutbah', 'KhutbahSection', 'Paragraph', 'Translation', 'GlossaryEntry', 'Display', 'KhutbahVersion'];

const dateFields = new Set(['createdAt', 'updatedAt', 'gregorianDate', 'lastSeenAt', 'deletedAt', 'subscriptionEndsAt']);
function revive(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = dateFields.has(k) && typeof v === 'string' ? new Date(v) : v;
  return out;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (k in obj) (out as Record<string, unknown>)[k] = obj[k];
  return out;
}

function newer(incoming: Record<string, unknown>, existing: { updatedAt?: Date } | null): boolean {
  if (!existing?.updatedAt) return true;
  const inc = incoming.updatedAt instanceof Date ? incoming.updatedAt : incoming.updatedAt ? new Date(String(incoming.updatedAt)) : null;
  if (!inc) return true;
  return inc.getTime() >= existing.updatedAt.getTime();
}

/**
 * Apply sync entries from the other side (edge<->cloud). Writes go straight to the tables — never through the
 * outbox — so they are not echoed back. Conflict policy: last-write-wins on `updatedAt`; the losing version
 * of a Translation is kept as a TranslationVersion row, and a losing Khutbah title/notes change is kept as a
 * KhutbahVersion "conflict copy".
 */
export async function applySyncEntries(db: PrismaClient, tenantId: string, entries: SyncEntry[]): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, skipped: 0, conflicts: 0, errors: [] };
  const sorted = [...entries].sort((a, b) => ORDER.indexOf(a.entity) - ORDER.indexOf(b.entity) || a.occurredAt.localeCompare(b.occurredAt));
  for (const e of sorted) {
    try {
      const already = await db.syncApplied.findUnique({ where: { id: e.id } });
      if (already) {
        result.skipped += 1;
        continue;
      }
      const outcome = await applyOne(db, tenantId, e);
      if (outcome === 'applied') result.applied += 1;
      else if (outcome === 'conflict') result.conflicts += 1;
      else result.skipped += 1;
      await db.syncApplied.create({ data: { id: e.id, tenantId } });
    } catch (err) {
      result.errors.push({ id: e.id, error: (err as Error).message });
    }
  }
  return result;
}

async function applyOne(db: PrismaClient, tenantId: string, e: SyncEntry): Promise<'applied' | 'skipped' | 'conflict'> {
  const p = revive(e.payload);
  switch (e.entity) {
    case 'Tenant': {
      if (e.op === 'DELETE') return 'skipped';
      const existing = await db.tenant.findUnique({ where: { id: tenantId } });
      if (!existing) return 'skipped';
      if (!newer(p, existing)) return 'conflict';
      await db.tenant.update({ where: { id: tenantId }, data: pick(p, ['name', 'timezone', 'locale', 'settings']) as Prisma.TenantUpdateInput });
      return 'applied';
    }
    case 'TenantLanguage': {
      const code = String(p.code ?? e.entityId.split(':').pop());
      if (e.op === 'DELETE') {
        await db.tenantLanguage.deleteMany({ where: { tenantId, code } });
        return 'applied';
      }
      await db.tenantLanguage.upsert({
        where: { tenantId_code: { tenantId, code } },
        update: { enabled: Boolean(p.enabled ?? true), order: Number(p.order ?? 0) },
        create: { tenantId, code, enabled: Boolean(p.enabled ?? true), order: Number(p.order ?? 0) },
      });
      return 'applied';
    }
    case 'Khutbah': {
      const existing = await db.khutbah.findUnique({ where: { id: e.entityId } });
      if (existing && existing.tenantId !== tenantId) return 'skipped';
      if (e.op === 'DELETE') {
        if (existing) await db.khutbah.update({ where: { id: e.entityId }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
        return 'applied';
      }
      const fields = pick(p, ['title', 'hijriDate', 'gregorianDate', 'imamName', 'status', 'targetLanguages', 'version', 'notes', 'copiedFromId', 'libraryId', 'createdById', 'deletedAt', 'createdAt', 'updatedAt']);
      if (existing) {
        if (!newer(p, existing)) {
          const last = await db.khutbahVersion.findFirst({ where: { khutbahId: existing.id }, orderBy: { version: 'desc' } });
          await db.khutbahVersion.create({
            data: { khutbahId: existing.id, tenantId, version: (last?.version ?? 0) + 1, changeNote: 'Sync conflict copy (remote lost)', snapshot: { remote: fields } as Prisma.InputJsonValue },
          });
          return 'conflict';
        }
        await db.khutbah.update({ where: { id: existing.id }, data: fields as Prisma.KhutbahUpdateInput });
      } else {
        await db.khutbah.create({ data: { id: e.entityId, tenantId, ...(fields as object) } as Prisma.KhutbahUncheckedCreateInput });
      }
      return 'applied';
    }
    case 'KhutbahSection': {
      if (e.op === 'DELETE') {
        await db.khutbahSection.deleteMany({ where: { id: e.entityId, tenantId } });
        return 'applied';
      }
      const k = await db.khutbah.findFirst({ where: { id: String(p.khutbahId), tenantId } });
      if (!k) return 'skipped';
      await db.khutbahSection.upsert({
        where: { id: e.entityId },
        update: { order: Number(p.order ?? 0) },
        create: { id: e.entityId, tenantId, khutbahId: k.id, type: p.type as never, order: Number(p.order ?? 0) },
      });
      return 'applied';
    }
    case 'Paragraph': {
      if (e.op === 'DELETE') {
        await db.paragraph.deleteMany({ where: { id: e.entityId, tenantId } });
        return 'applied';
      }
      const section = await db.khutbahSection.findFirst({ where: { id: String(p.sectionId), tenantId } });
      if (!section) return 'skipped';
      const existing = await db.paragraph.findUnique({ where: { id: e.entityId } });
      if (existing && !newer(p, existing)) return 'conflict';
      const fields = pick(p, ['order', 'kind', 'reference', 'textAr', 'hash', 'estimatedSeconds', 'createdAt', 'updatedAt']);
      await db.paragraph.upsert({
        where: { id: e.entityId },
        update: fields as Prisma.ParagraphUpdateInput,
        create: { id: e.entityId, tenantId, sectionId: section.id, ...(fields as object) } as Prisma.ParagraphUncheckedCreateInput,
      });
      return 'applied';
    }
    case 'Translation': {
      if (e.op === 'DELETE') {
        await db.translation.deleteMany({ where: { id: e.entityId, tenantId } });
        return 'applied';
      }
      const paragraph = await db.paragraph.findFirst({ where: { id: String(p.paragraphId), tenantId } });
      if (!paragraph) return 'skipped';
      const lang = String(p.lang);
      const existing = (await db.translation.findUnique({ where: { id: e.entityId } })) ?? (await db.translation.findUnique({ where: { paragraphId_lang: { paragraphId: paragraph.id, lang } } }));
      const fields = pick(p, ['text', 'status', 'providerType', 'providerMeta', 'version', 'reviewedById', 'approvedById', 'reviewNote', 'createdAt', 'updatedAt']);
      if (existing) {
        if (!newer(p, existing)) {
          await db.translationVersion.create({
            data: { translationId: existing.id, tenantId, version: existing.version + 1000, text: String(p.text ?? ''), status: (p.status as never) ?? 'MACHINE', providerType: (p.providerType as never) ?? null },
          });
          return 'conflict';
        }
        await db.translation.update({ where: { id: existing.id }, data: fields as Prisma.TranslationUpdateInput });
      } else {
        await db.translation.create({ data: { id: e.entityId, tenantId, paragraphId: paragraph.id, lang, ...(fields as object) } as Prisma.TranslationUncheckedCreateInput });
      }
      return 'applied';
    }
    case 'GlossaryEntry': {
      if (e.op === 'DELETE') {
        await db.glossaryEntry.deleteMany({ where: { id: e.entityId, tenantId } });
        return 'applied';
      }
      const term = String(p.term);
      const lang = String(p.lang ?? '*');
      const existing = (await db.glossaryEntry.findUnique({ where: { id: e.entityId } })) ?? (await db.glossaryEntry.findUnique({ where: { tenantId_term_lang: { tenantId, term, lang } } }));
      if (existing && !newer(p, existing)) return 'conflict';
      const fields = pick(p, ['replacement', 'mode', 'note', 'updatedAt']);
      if (existing) await db.glossaryEntry.update({ where: { id: existing.id }, data: fields as Prisma.GlossaryEntryUpdateInput });
      else await db.glossaryEntry.create({ data: { id: e.entityId, tenantId, term, lang, ...(fields as object) } as Prisma.GlossaryEntryUncheckedCreateInput });
      return 'applied';
    }
    case 'Display': {
      if (e.op === 'DELETE') {
        await db.display.deleteMany({ where: { id: e.entityId, tenantId } });
        return 'applied';
      }
      const existing = await db.display.findUnique({ where: { id: e.entityId } });
      if (existing && !newer(p, existing)) return 'conflict';
      const fields = pick(p, ['name', 'token', 'languages', 'layout', 'fontScale', 'theme', 'showPrevious', 'showArabic', 'showQr', 'logoUrl', 'location', 'updatedAt']);
      if (existing) await db.display.update({ where: { id: existing.id }, data: fields as Prisma.DisplayUpdateInput });
      else await db.display.create({ data: { id: e.entityId, tenantId, ...(fields as object) } as Prisma.DisplayUncheckedCreateInput });
      return 'applied';
    }
    case 'KhutbahVersion': {
      if (e.op === 'DELETE') return 'skipped';
      const k = await db.khutbah.findFirst({ where: { id: String(p.khutbahId), tenantId } });
      if (!k) return 'skipped';
      const version = Number(p.version);
      const exists = await db.khutbahVersion.findUnique({ where: { khutbahId_version: { khutbahId: k.id, version } } });
      if (exists) return 'skipped';
      await db.khutbahVersion.create({
        data: { id: e.entityId, khutbahId: k.id, tenantId, version, snapshot: (p.snapshot ?? {}) as Prisma.InputJsonValue, changeNote: (p.changeNote as string) ?? null, createdById: (p.createdById as string) ?? null },
      });
      return 'applied';
    }
    default:
      return 'skipped';
  }
}
