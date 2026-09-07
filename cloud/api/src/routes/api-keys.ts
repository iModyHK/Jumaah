import type { FastifyInstance } from 'fastify';
import { cloudCtx } from '../context.js';
import { randomToken, sha256 } from '@jumaah/cloud-db';
import { createApiKeySchema, createWebhookSchema, updateWebhookSchema, type ApiKeyDto, type WebhookDto } from '@jumaah/cloud-shared';
import { audit } from '@jumaah/api';
import { badRequest, notFound } from '@jumaah/api';
import { idParam, parse } from '@jumaah/api';
import { ADMIN_ROLES } from '@jumaah/api';
import { assertFeature } from '../services/features.js';
import { buildPayload, deliver, webhookUrlError } from '../services/webhook.service.js';
import { forgetApiKey } from '../services/api-key.service.js';
import { actorOf } from '@jumaah/api';
import { asCoreDb } from '@jumaah/cloud-db';

const keyDto = (k: { id: string; name: string; prefix: string; readOnly: boolean; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }): ApiKeyDto => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  readOnly: k.readOnly,
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  revokedAt: k.revokedAt?.toISOString() ?? null,
  createdAt: k.createdAt.toISOString(),
});

const hookDto = (h: { id: string; name: string; url: string; events: string[]; enabled: boolean; lastStatus: number | null; lastError: string | null; lastDeliveredAt: Date | null; failures: number; createdAt: Date }): WebhookDto => ({
  id: h.id,
  name: h.name,
  url: h.url,
  events: h.events as WebhookDto['events'],
  enabled: h.enabled,
  lastStatus: h.lastStatus,
  lastError: h.lastError,
  lastDeliveredAt: h.lastDeliveredAt?.toISOString() ?? null,
  failures: h.failures,
  createdAt: h.createdAt.toISOString(),
});

/** API keys and webhooks (hosted edition, plans with the `api` feature). Never reachable with an API key itself. */
export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db, config } = ctx;
  const admin = app.requireRole(...ADMIN_ROLES);
  const gate = async (tenantId: string) => {
    const t = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw notFound('Tenant');
    assertFeature('api', t);
  };

  // ---- API keys ----
  app.get('/api-keys', { preHandler: admin }, async (request) => {
    await gate(request.tenantId);
    const rows = await db.apiKey.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(keyDto);
  });

  /** The full key is returned once, here, and never again. */
  app.post('/api-keys', { preHandler: admin }, async (request, reply) => {
    await gate(request.tenantId);
    const body = parse(createApiKeySchema, request.body);
    const secret = `jk_${randomToken(32)}`;
    const row = await db.apiKey.create({ data: { tenantId: request.tenantId, name: body.name, prefix: secret.slice(0, 11), keyHash: sha256(secret), readOnly: body.readOnly, createdById: request.user!.id } });
    await audit(asCoreDb(db), request.tenantId, actorOf(request), 'apikey.create', 'ApiKey', row.id, null, { name: row.name, readOnly: row.readOnly });
    return reply.code(201).send({ ...keyDto(row), key: secret });
  });

  app.delete('/api-keys/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const row = await db.apiKey.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!row) throw notFound('API key');
    const updated = row.revokedAt ? row : await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await forgetApiKey(ctx, row.keyHash);
    await audit(asCoreDb(db), request.tenantId, actorOf(request), 'apikey.revoke', 'ApiKey', id, null, { name: row.name });
    return keyDto(updated);
  });

  // ---- Webhooks ----
  app.get('/webhooks', { preHandler: admin }, async (request) => {
    await gate(request.tenantId);
    const rows = await db.webhook.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'asc' } });
    return rows.map(hookDto);
  });

  /** The signing secret is returned once, on creation. */
  app.post('/webhooks', { preHandler: admin }, async (request, reply) => {
    await gate(request.tenantId);
    const body = parse(createWebhookSchema, request.body);
    const urlError = webhookUrlError(body.url, config.NODE_ENV === 'production');
    if (urlError) throw badRequest('Webhook address not allowed', { code: urlError });
    const secret = `whsec_${randomToken(24)}`;
    const row = await db.webhook.create({ data: { tenantId: request.tenantId, name: body.name, url: body.url, events: body.events, enabled: body.enabled, secret } });
    await audit(asCoreDb(db), request.tenantId, actorOf(request), 'webhook.create', 'Webhook', row.id, null, { name: row.name, url: row.url, events: row.events });
    return reply.code(201).send({ ...hookDto(row), secret });
  });

  app.patch('/webhooks/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateWebhookSchema, request.body);
    const before = await db.webhook.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!before) throw notFound('Webhook');
    if (body.url) {
      const urlError = webhookUrlError(body.url, config.NODE_ENV === 'production');
      if (urlError) throw badRequest('Webhook address not allowed', { code: urlError });
    }
    const row = await db.webhook.update({ where: { id }, data: body });
    await audit(asCoreDb(db), request.tenantId, actorOf(request), 'webhook.update', 'Webhook', id, hookDto(before), hookDto(row));
    return hookDto(row);
  });

  app.delete('/webhooks/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const before = await db.webhook.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!before) throw notFound('Webhook');
    await db.webhook.delete({ where: { id } });
    await audit(asCoreDb(db), request.tenantId, actorOf(request), 'webhook.delete', 'Webhook', id, hookDto(before), null);
    return { ok: true };
  });

  /** Send a `ping` right now and report what the endpoint answered. */
  app.post('/webhooks/:id/test', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const hook = await db.webhook.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!hook) throw notFound('Webhook');
    await gate(request.tenantId);
    const { id: deliveryId, body } = buildPayload(request.tenantId, 'ping', { message: 'Hello from Jumaah', webhookId: hook.id });
    const result = await deliver(ctx, hook, 'ping', deliveryId, body);
    return { deliveryId, ...result };
  });
}
