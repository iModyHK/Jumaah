import type { FastifyInstance, FastifyRequest } from 'fastify';
import { applySyncEntries, sha256 } from '@jumaah/db';
import { OUTBOX_MAX_ATTEMPTS, remoteTranslateSchema, syncPullSchema, syncPushSchema, type SyncStatusDto } from '@jumaah/shared';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { exportTenant, restoreBackup } from '../services/backup.service.js';
import { isOnline } from '../services/provider.service.js';
import { translateAdHoc } from '../services/translation.service.js';
import { actorOf } from './auth.js';

/**
 * Edge <-> Cloud synchronisation.
 * Cloud side: endpoints authenticated with the tenant's sync key (`x-sync-key`), called by the edge sync-worker.
 * Edge side: status/trigger endpoints for the mosque admin UI.
 */
export async function syncRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, redis } = app.ctx;

  async function tenantFromSyncKey(request: FastifyRequest, slug: string) {
    const key = request.headers['x-sync-key'];
    if (typeof key !== 'string' || !key) throw unauthorized('Missing sync key');
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (!tenant || !tenant.isActive || !tenant.syncKeyHash || tenant.syncKeyHash !== sha256(key)) throw unauthorized('Invalid sync key');
    if (tenant.subscriptionStatus === 'SUSPENDED') throw forbidden('Subscription suspended');
    return tenant;
  }

  const syncLimit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  app.get('/sync/version', syncLimit, async () => {
    const latest = await db.platformSetting.findUnique({ where: { key: 'edge.latestImageTag' } });
    return { imageTag: config.IMAGE_TAG, latestImageTag: (latest?.value as { tag?: string })?.tag ?? config.IMAGE_TAG, mode: config.DEPLOYMENT_MODE, serverTime: Date.now() };
  });

  app.post('/sync/push', syncLimit, async (request) => {
    const body = parse(syncPushSchema, request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const result = await applySyncEntries(db, tenant.id, body.entries);
    await db.syncState.upsert({ where: { tenantId: tenant.id }, update: { lastPullAt: new Date(), deviceId: body.deviceId }, create: { tenantId: tenant.id, deviceId: body.deviceId, lastPullAt: new Date() } });
    if (result.applied > 0 || result.conflicts > 0) {
      await audit(db, tenant.id, { id: null, ip: request.ip }, 'sync.push', 'Tenant', tenant.id, null, { device: body.deviceId, ...result, errors: result.errors.length });
    }
    return result;
  });

  app.post('/sync/pull', syncLimit, async (request) => {
    const body = parse(syncPullSchema, request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const since = body.since ? new Date(body.since) : new Date(0);
    const rows = await db.outbox.findMany({ where: { tenantId: tenant.id, occurredAt: { gt: since } }, orderBy: { occurredAt: 'asc' }, take: body.limit });
    await db.syncState.upsert({ where: { tenantId: tenant.id }, update: { lastPushAt: new Date() }, create: { tenantId: tenant.id, deviceId: 'cloud', lastPushAt: new Date() } });
    return {
      entries: rows.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entityId, op: r.op, payload: r.payload, version: r.version, occurredAt: r.occurredAt.toISOString() })),
      cursor: rows.length ? rows[rows.length - 1].occurredAt.toISOString() : body.since ?? null,
      hasMore: rows.length === body.limit,
    };
  });

  /** Full tenant snapshot for a brand-new edge server (first run). */
  app.post('/sync/bootstrap', syncLimit, async (request) => {
    const body = parse(z.object({ tenantSlug: z.string() }), request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const { payload } = await exportTenant(app.ctx, tenant.id);
    await audit(db, tenant.id, { id: null, ip: request.ip }, 'sync.bootstrap', 'Tenant', tenant.id);
    return payload;
  });

  /** Cloud-side translation using central keys (edge relay). */
  app.post('/sync/translate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(remoteTranslateSchema, request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const res = await translateAdHoc(app.ctx, tenant.id, body.items, body.targetLangs, body.glossary);
    await audit(db, tenant.id, { id: null, ip: request.ip }, 'sync.translate', 'Tenant', tenant.id, null, { items: body.items.length, langs: body.targetLangs, costUsd: res.costUsd });
    return res;
  });

  // ---- Edge admin side ----
  app.get('/sync/status', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const state = await db.syncState.findUnique({ where: { tenantId: request.tenantId } });
    const [pendingOutbox, failedOutbox] = await Promise.all([
      db.outbox.count({ where: { tenantId: request.tenantId, syncedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } } }),
      db.outbox.count({ where: { tenantId: request.tenantId, syncedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } } }),
    ]);
    const online = config.isEdge ? await isOnline(app.ctx) : true;
    const latest = config.isCloud ? await db.platformSetting.findUnique({ where: { key: 'edge.latestImageTag' } }) : null;
    const dto: SyncStatusDto = {
      mode: config.DEPLOYMENT_MODE,
      cloudUrl: config.cloudApiUrl,
      online,
      lastPushAt: state?.lastPushAt?.toISOString() ?? null,
      lastPullAt: state?.lastPullAt?.toISOString() ?? null,
      pendingOutbox,
      failedOutbox,
      lastError: state?.lastError ?? null,
      imageTag: config.IMAGE_TAG,
      latestImageTag: state?.latestImageTag ?? (latest?.value as { tag?: string })?.tag ?? null,
    };
    return dto;
  });

  app.post('/sync/now', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    await redis.publish('jumaah:sync:now', request.tenantId);
    await audit(db, request.tenantId, actorOf(request), 'sync.trigger', 'Tenant', request.tenantId);
    return { ok: true };
  });

  /** Put parked outbox rows (rejected OUTBOX_MAX_ATTEMPTS times) back in the queue and trigger a sync. */
  app.post('/sync/retry-failed', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const res = await db.outbox.updateMany({
      where: { tenantId: request.tenantId, syncedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } },
      data: { attempts: 0, lastError: null },
    });
    await db.syncState.updateMany({ where: { tenantId: request.tenantId }, data: { lastError: null } });
    await redis.publish('jumaah:sync:now', request.tenantId);
    await audit(db, request.tenantId, actorOf(request), 'sync.retryFailed', 'Tenant', request.tenantId, null, { requeued: res.count });
    return { ok: true, requeued: res.count };
  });

  /** Edge: apply a bootstrap snapshot fetched by the worker (or uploaded by the admin). */
  app.post('/sync/apply-bootstrap', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const data = request.body as Parameters<typeof restoreBackup>[2];
    await restoreBackup(app.ctx, request.tenantId, data, actorOf(request));
    return { ok: true };
  });
}
