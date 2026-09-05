/**
 * Shared translation network (hosted edition). Mosques on plans with `networkPublish` share their approved
 * translations, keyed by the paragraph hash (normalised Arabic) and language; mosques with `networkRead` pick them
 * up during translation jobs before any AI is called. Only approved text is ever published, and a mosque that
 * switches publishing off takes its contributions down again.
 */
import type { Db, Prisma } from '@jumaah/db';
import type { NetworkSettings, NetworkStatusDto } from '@jumaah/shared';
import { audit, outbox, type Actor } from '../lib/audit.js';
import type { AppContext } from '../lib/context.js';
import { tenantFeatures } from './features.service.js';

export interface NetworkAccess {
  read: boolean;
  publish: boolean;
}

/** What the mosque may do right now: its switches, limited by the plan. Reading defaults to on, publishing to off. */
export function networkAccess(settings: Record<string, unknown>, t: Parameters<typeof tenantFeatures>[0]): NetworkAccess {
  const { features } = tenantFeatures(t);
  const s = ((settings.network as NetworkSettings | undefined) ?? {}) as NetworkSettings;
  return { read: features.networkRead && s.read !== false, publish: features.networkPublish && !!s.publish };
}

export async function networkAccessOf(db: Db, tenantId: string): Promise<NetworkAccess> {
  const t = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return { read: false, publish: false };
  return networkAccess((t.settings as Record<string, unknown>) ?? {}, t);
}

/** Best published translation for a paragraph hash, or null. Most-reused first, then newest. */
export async function lookupNetwork(db: Db, hash: string, lang: string): Promise<{ id: string; text: string; sourceTenantId: string } | null> {
  const row = await db.networkTranslation.findFirst({ where: { hash, lang }, orderBy: [{ uses: 'desc' }, { updatedAt: 'desc' }], select: { id: true, text: true, sourceTenantId: true } });
  return row;
}

/** Store a network hit on a paragraph as a REVIEWED translation (someone reviewed it elsewhere; the mosque approves). */
export async function saveNetworkTranslation(ctx: AppContext, tenantId: string, paragraphId: string, lang: string, hit: { id: string; text: string; sourceTenantId: string }, userId: string | null) {
  const providerMeta = { network: true, sourceTenantId: hit.sourceTenantId } as Prisma.InputJsonValue;
  const existing = await ctx.db.translation.findUnique({ where: { paragraphId_lang: { paragraphId, lang } } });
  const row = existing
    ? await ctx.db.translation.update({ where: { id: existing.id }, data: { text: hit.text, status: 'REVIEWED', providerType: 'MANUAL', providerMeta, version: { increment: 1 }, reviewedById: null, approvedById: null, reviewNote: null } })
    : await ctx.db.translation.create({ data: { paragraphId, tenantId, lang, text: hit.text, status: 'REVIEWED', providerType: 'MANUAL', providerMeta } });
  await ctx.db.translationVersion.create({ data: { translationId: row.id, tenantId, version: row.version, text: hit.text, status: 'REVIEWED', providerType: 'MANUAL', changedById: userId } });
  await ctx.db.networkTranslation.update({ where: { id: hit.id }, data: { uses: { increment: 1 } } }).catch(() => undefined);
  await outbox(ctx.db, tenantId, 'Translation', row.id, 'UPSERT', row, row.version);
  return row;
}

/**
 * Publish approved translations of a mosque: the given translation ids, or every approved translation when `ids`
 * is omitted. Silently does nothing unless the mosque's plan and switch allow publishing.
 */
export async function publishTranslations(ctx: AppContext, tenantId: string, ids?: string[]): Promise<number> {
  const access = await networkAccessOf(ctx.db, tenantId);
  if (!access.publish) return 0;
  const rows = await ctx.db.translation.findMany({
    where: { tenantId, status: 'APPROVED', ...(ids ? { id: { in: ids } } : {}), text: { not: '' } },
    select: { lang: true, text: true, paragraph: { select: { hash: true, kind: true, reference: true } } },
  });
  let n = 0;
  for (const r of rows) {
    const text = r.text.trim();
    if (!text) continue;
    await ctx.db.networkTranslation.upsert({
      where: { hash_lang_sourceTenantId: { hash: r.paragraph.hash, lang: r.lang, sourceTenantId: tenantId } },
      update: { text, kind: r.paragraph.kind, reference: r.paragraph.reference },
      create: { hash: r.paragraph.hash, lang: r.lang, text, kind: r.paragraph.kind, reference: r.paragraph.reference, sourceTenantId: tenantId },
    });
    n += 1;
  }
  return n;
}

/** Fire-and-forget publishing after an approval; errors are logged, never surfaced to the approver. */
export function publishLater(ctx: AppContext, tenantId: string, ids: string[]): void {
  if (!ids.length) return;
  publishTranslations(ctx, tenantId, ids).catch((err) => ctx.log.warn({ err, tenantId }, 'network publish failed'));
}

/** Take every contribution of a mosque down (publishing switched off, plan lapsed, mosque suspended). */
export async function unpublishAll(ctx: AppContext, tenantId: string): Promise<number> {
  const res = await ctx.db.networkTranslation.deleteMany({ where: { sourceTenantId: tenantId } });
  return res.count;
}

export async function networkStatus(ctx: AppContext, tenantId: string): Promise<NetworkStatusDto> {
  const t = await ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = (t.settings as Record<string, unknown>) ?? {};
  const s = ((settings.network as NetworkSettings | undefined) ?? {}) as NetworkSettings;
  const { features, plan } = tenantFeatures(t);
  const access = networkAccess(settings, t);
  const [published, reused, pool] = await Promise.all([
    ctx.db.networkTranslation.count({ where: { sourceTenantId: tenantId } }),
    ctx.db.translation.count({ where: { tenantId, providerMeta: { path: ['network'], equals: true } } }),
    ctx.db.networkTranslation.count(),
  ]);
  return {
    plan,
    allowed: { read: features.networkRead, publish: features.networkPublish },
    read: s.read !== false,
    publish: !!s.publish,
    effective: access,
    published,
    reused,
    pool,
  };
}

/** Change the switches (validated and plan-checked by the route); switching publishing off removes the contributions. */
export async function setNetworkSettings(ctx: AppContext, tenantId: string, next: NetworkSettings, actor: Actor): Promise<NetworkStatusDto> {
  const t = await ctx.db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = (t.settings as Record<string, unknown>) ?? {};
  const before = ((settings.network as NetworkSettings | undefined) ?? {}) as NetworkSettings;
  const merged: NetworkSettings = { ...before, ...next };
  await ctx.db.tenant.update({ where: { id: t.id }, data: { settings: { ...settings, network: merged } as Prisma.InputJsonValue } });
  let removed = 0;
  let added = 0;
  if (before.publish && merged.publish === false) removed = await unpublishAll(ctx, tenantId);
  if (!before.publish && merged.publish) added = await publishTranslations(ctx, tenantId);
  await audit(ctx.db, tenantId, actor, 'network.settings', 'Tenant', tenantId, before, { ...merged, removed, added });
  return networkStatus(ctx, tenantId);
}
