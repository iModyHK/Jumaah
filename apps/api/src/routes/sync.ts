import type { FastifyInstance } from 'fastify';
import { OUTBOX_MAX_ATTEMPTS, type SyncStatusDto } from '@jumaah/core';
import { audit } from '../lib/audit.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { restoreBackup } from '../services/backup.service.js';
import { isOnline } from '../services/provider.service.js';
import { actorOf } from './auth.js';

/**
 * Sync client: a mosque server that optionally connects to Jumaah Cloud (CLOUD_API_URL, EDGE_TENANT_SLUG,
 * EDGE_SYNC_KEY). The sync-worker does the pushing and pulling; these endpoints show its state to the admin and
 * trigger it. The server side of the protocol lives in the cloud (see docs/sync-protocol.md).
 */
export async function syncRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, redis, hooks } = app.ctx;

  app.get('/sync/status', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const state = await db.syncState.findUnique({ where: { tenantId: request.tenantId } });
    const [pendingOutbox, failedOutbox] = await Promise.all([
      db.outbox.count({ where: { tenantId: request.tenantId, syncedAt: null, attempts: { lt: OUTBOX_MAX_ATTEMPTS } } }),
      db.outbox.count({ where: { tenantId: request.tenantId, syncedAt: null, attempts: { gte: OUTBOX_MAX_ATTEMPTS } } }),
    ]);
    const online = hooks.assumeOnline ? true : await isOnline(app.ctx);
    const dto: SyncStatusDto = {
      mode: hooks.mode ?? 'community',
      cloudUrl: config.cloudApiUrl,
      online,
      lastPushAt: state?.lastPushAt?.toISOString() ?? null,
      lastPullAt: state?.lastPullAt?.toISOString() ?? null,
      pendingOutbox,
      failedOutbox,
      lastError: state?.lastError ?? null,
      imageTag: config.IMAGE_TAG,
      latestImageTag: state?.latestImageTag ?? null,
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

  /** Apply a bootstrap snapshot fetched by the worker (or uploaded by the admin). */
  app.post('/sync/apply-bootstrap', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const data = request.body as Parameters<typeof restoreBackup>[2];
    await restoreBackup(app.ctx, request.tenantId, data, actorOf(request));
    return { ok: true };
  });
}
