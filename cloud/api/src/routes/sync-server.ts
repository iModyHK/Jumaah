import type { FastifyInstance, FastifyRequest } from 'fastify';
import { applySyncEntries, sha256 } from '@jumaah/cloud-db';
import { remoteTranslateSchema, syncPullSchema, syncPushSchema } from '@jumaah/core';
import { z } from 'zod';
import { audit, exportTenant, forbidden, parse, translateAdHoc, unauthorized } from '@jumaah/api';
import { cloudCtx } from '../context.js';
import { coreCtx } from '../context.js';

/**
 * Server side of the sync protocol (docs/sync-protocol.md in the Community repository): endpoints a mosque server
 * calls with its sync key (`x-sync-key`). The client side lives in the Community API and its sync-worker.
 */
export async function syncServerRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db, config } = ctx;

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
    return { imageTag: config.IMAGE_TAG, latestImageTag: (latest?.value as { tag?: string })?.tag ?? config.IMAGE_TAG, mode: 'cloud', serverTime: Date.now() };
  });

  app.post('/sync/push', syncLimit, async (request) => {
    const body = parse(syncPushSchema, request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const result = await applySyncEntries(db as never, tenant.id, body.entries);
    await db.syncState.upsert({ where: { tenantId: tenant.id }, update: { lastPullAt: new Date(), deviceId: body.deviceId }, create: { tenantId: tenant.id, deviceId: body.deviceId, lastPullAt: new Date() } });
    if (result.applied > 0 || result.conflicts > 0) {
      await audit(db as never, tenant.id, { id: null, ip: request.ip }, 'sync.push', 'Tenant', tenant.id, null, { device: body.deviceId, ...result, errors: result.errors.length });
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

  /** Full tenant snapshot for a brand-new mosque server (first run). */
  app.post('/sync/bootstrap', syncLimit, async (request) => {
    const body = parse(z.object({ tenantSlug: z.string() }), request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const { payload } = await exportTenant(app.ctx, tenant.id);
    await audit(db as never, tenant.id, { id: null, ip: request.ip }, 'sync.bootstrap', 'Tenant', tenant.id);
    return payload;
  });

  /** Cloud-side translation using central keys (mosque server relay). */
  app.post('/sync/translate', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const body = parse(remoteTranslateSchema, request.body);
    const tenant = await tenantFromSyncKey(request, body.tenantSlug);
    const res = await translateAdHoc(app.ctx, tenant.id, body.items, body.targetLangs, body.glossary);
    await audit(db as never, tenant.id, { id: null, ip: request.ip }, 'sync.translate', 'Tenant', tenant.id, null, { items: body.items.length, langs: body.targetLangs, costUsd: res.costUsd });
    return res;
  });
}
