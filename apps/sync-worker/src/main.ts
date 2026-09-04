/**
 * Edge sync worker: pushes the local outbox to the cloud and pulls the cloud's outbox for this tenant.
 * Runs only when DEPLOYMENT_MODE=edge and CLOUD_API_URL is set. Safe to restart at any time (idempotent
 * apply on both sides via SyncApplied ids). Also checks the latest edge image tag for the admin UI.
 */
import { createPrisma, applySyncEntries, type SyncEntry } from '@jumaah/db';
import { OUTBOX_MAX_ATTEMPTS } from '@jumaah/shared';
import { Redis } from 'ioredis';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' } });

const env = {
  mode: process.env.DEPLOYMENT_MODE ?? 'edge',
  cloudUrl: (process.env.CLOUD_API_URL ?? '').replace(/\/$/, ''),
  tenantSlug: process.env.EDGE_TENANT_SLUG ?? '',
  syncKey: process.env.EDGE_SYNC_KEY ?? '',
  deviceId: process.env.EDGE_DEVICE_ID || `edge-${Math.random().toString(16).slice(2, 10)}`,
  intervalMs: Number(process.env.SYNC_INTERVAL_SECONDS ?? 60) * 1000,
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  imageTag: process.env.IMAGE_TAG ?? 'dev',
};

const db = createPrisma(env.databaseUrl);
let running = false;

async function cloud<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.cloudUrl}/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sync-key': env.syncKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

async function tenantId(): Promise<string> {
  const t = await db.tenant.findUnique({ where: { slug: env.tenantSlug } });
  if (t) return t.id;
  // First run on a fresh edge server: pull the full tenant snapshot from the cloud.
  log.info('tenant not found locally — bootstrapping from cloud');
  const snapshot = await cloud<{ tenant: { id: string; name: string; slug: string; timezone: string; locale: string; settings: unknown } }>('/sync/bootstrap', { tenantSlug: env.tenantSlug });
  const created = await db.tenant.create({
    data: { id: snapshot.tenant.id, name: snapshot.tenant.name, slug: snapshot.tenant.slug, timezone: snapshot.tenant.timezone, locale: snapshot.tenant.locale, settings: (snapshot.tenant.settings ?? {}) as never, plan: 'PRO', subscriptionStatus: 'ACTIVE' },
  });
  // Replay the rest of the snapshot through the same restore path the API uses (via its HTTP endpoint is not
  // available without auth), so we apply it as sync entries.
  const entries = snapshotToEntries(snapshot as unknown as Record<string, unknown[]>);
  const res = await applySyncEntries(db, created.id, entries);
  log.info(res, 'bootstrap applied');
  return created.id;
}

function snapshotToEntries(s: Record<string, unknown[]>): SyncEntry[] {
  const now = new Date().toISOString();
  const mk = (entity: string, rows: unknown[], idOf: (r: Record<string, unknown>) => string): SyncEntry[] =>
    (rows ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return { id: `bootstrap:${entity}:${idOf(row)}`, entity, entityId: idOf(row), op: 'UPSERT', payload: row, version: 1, occurredAt: now };
    });
  return [
    ...mk('TenantLanguage', s.languages, (r) => `${r.tenantId}:${r.code}`),
    ...mk('Khutbah', s.khutbahs, (r) => String(r.id)),
    ...mk('KhutbahSection', s.sections, (r) => String(r.id)),
    ...mk('Paragraph', s.paragraphs, (r) => String(r.id)),
    ...mk('Translation', s.translations, (r) => String(r.id)),
    ...mk('GlossaryEntry', s.glossary, (r) => String(r.id)),
    ...mk('Display', s.displays, (r) => String(r.id)),
    ...mk('KhutbahVersion', s.khutbahVersions, (r) => String(r.id)),
  ];
}

export async function syncOnce(): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const tid = await tenantId();
    const state = await db.syncState.upsert({ where: { tenantId: tid }, update: {}, create: { tenantId: tid, deviceId: env.deviceId } });

    // ---- push
    // Rows the cloud has rejected OUTBOX_MAX_ATTEMPTS times are parked: they no longer occupy the batch, so one bad
    // row can never stall everything behind it. The admin sees the count in sync status and can requeue them.
    let pushed = 0;
    for (;;) {
      const batch = await db.outbox.findMany({ where: { tenantId: tid, syncedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } }, orderBy: { occurredAt: 'asc' }, take: 200 });
      if (batch.length === 0) break;
      const res = await cloud<{ applied: number; skipped: number; conflicts: number; errors: Array<{ id: string; error: string }> }>('/sync/push', {
        tenantSlug: env.tenantSlug,
        deviceId: env.deviceId,
        entries: batch.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entityId, op: r.op, payload: r.payload, version: r.version, occurredAt: r.occurredAt.toISOString() })),
      });
      const failed = new Set(res.errors.map((e) => e.id));
      await db.outbox.updateMany({ where: { id: { in: batch.filter((r) => !failed.has(r.id)).map((r) => r.id) } }, data: { syncedAt: new Date() } });
      for (const e of res.errors) await db.outbox.update({ where: { id: e.id }, data: { attempts: { increment: 1 }, lastError: e.error.slice(0, 500) } });
      pushed += batch.length - failed.size;
      if (failed.size === batch.length) break; // avoid spinning on a poison batch
    }

    // ---- pull
    let cursor = state.pullCursor?.toISOString() ?? null;
    let pulled = 0;
    for (;;) {
      const res = await cloud<{ entries: SyncEntry[]; cursor: string | null; hasMore: boolean }>('/sync/pull', { tenantSlug: env.tenantSlug, since: cursor, limit: 200 });
      if (res.entries.length === 0) break;
      const applied = await applySyncEntries(db, tid, res.entries);
      pulled += applied.applied;
      cursor = res.cursor;
      await db.syncState.update({ where: { tenantId: tid }, data: { pullCursor: cursor ? new Date(cursor) : undefined } });
      if (!res.hasMore) break;
    }

    // ---- version check
    let latestImageTag: string | undefined;
    try {
      const v = await fetch(`${env.cloudUrl}/api/sync/version`, { headers: { 'x-sync-key': env.syncKey }, signal: AbortSignal.timeout(10_000) });
      if (v.ok) latestImageTag = ((await v.json()) as { latestImageTag?: string }).latestImageTag;
    } catch {
      /* ignore */
    }

    const parked = await db.outbox.count({ where: { tenantId: tid, syncedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } } });
    const lastError = parked > 0 ? `${parked} change(s) rejected by the cloud ${OUTBOX_MAX_ATTEMPTS} times and parked; use "Retry failed" in Cloud sync` : null;
    await db.syncState.update({ where: { tenantId: tid }, data: { lastPushAt: new Date(), lastPullAt: new Date(), lastError, deviceId: env.deviceId, latestImageTag } });
    await db.syncApplied.deleteMany({ where: { tenantId: tid, appliedAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
    await db.outbox.deleteMany({ where: { tenantId: tid, syncedAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
    if (parked > 0) log.warn({ parked }, 'outbox rows parked after repeated rejections');
    log.info({ pushed, pulled, parked, ms: Date.now() - started, latestImageTag }, 'sync ok');
  } catch (err) {
    const message = (err as Error).message;
    log.warn({ err: message }, 'sync failed (will retry)');
    const t = await db.tenant.findUnique({ where: { slug: env.tenantSlug } }).catch(() => null);
    if (t) await db.syncState.upsert({ where: { tenantId: t.id }, update: { lastError: message.slice(0, 500) }, create: { tenantId: t.id, deviceId: env.deviceId, lastError: message.slice(0, 500) } }).catch(() => undefined);
  } finally {
    running = false;
  }
}

async function main() {
  if (env.mode !== 'edge' || !env.cloudUrl || !env.tenantSlug || !env.syncKey) {
    log.info({ mode: env.mode, cloudUrl: env.cloudUrl || null }, 'sync disabled (edge mode with CLOUD_API_URL, EDGE_TENANT_SLUG and EDGE_SYNC_KEY required); idling');
    setInterval(() => undefined, 1 << 30);
    return;
  }
  log.info({ cloudUrl: env.cloudUrl, tenant: env.tenantSlug, device: env.deviceId, intervalMs: env.intervalMs }, 'sync worker starting');
  const sub = new Redis(env.redisUrl, { lazyConnect: true });
  sub.on('error', (e) => log.warn({ err: e.message }, 'redis'));
  try {
    await sub.connect();
    await sub.subscribe('jumaah:sync:now');
    sub.on('message', () => void syncOnce());
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'redis subscribe failed; manual "sync now" disabled');
  }
  await syncOnce();
  setInterval(() => void syncOnce(), env.intervalMs);
  const stop = async () => {
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '');
if (isMain) {
  main().catch((err) => {
    log.error(err);
    process.exit(1);
  });
}
