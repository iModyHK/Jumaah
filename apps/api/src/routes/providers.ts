import type { FastifyInstance } from 'fastify';
import { apiKeyHint, encryptSecret } from '@jumaah/db';
import { providerConfigSchema, providerTestSchema, type ProviderType } from '@jumaah/shared';
import { PROVIDER_META, listProviderTypes } from '@jumaah/translation-providers';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/errors.js';
import { providerDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ADMIN_ROLES, ALL_STAFF } from '../plugins/auth.js';
import { loadGlossary, providerFromConfig, resolveChain } from '../services/provider.service.js';
import { actorOf } from './auth.js';

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);

  /** Global providers are managed by super admins (tenantId=null); mosque admins manage their own. */
  function scopeOf(request: { user: { role: string } | null; tenantId: string; query: unknown }) {
    const global = (request.query as { global?: string })?.global === '1';
    if (global && request.user?.role !== 'SUPER_ADMIN') throw forbidden('Global providers are managed by the platform');
    return global ? null : request.tenantId;
  }

  app.get('/providers/types', { preHandler: app.requireRole(...ALL_STAFF) }, async () => {
    return listProviderTypes().map((type) => ({ type, ...PROVIDER_META[type] }));
  });

  app.get('/providers', { preHandler: admin }, async (request) => {
    const rows = await db.providerConfig.findMany({ where: { OR: [{ tenantId: request.tenantId }, { tenantId: null }] }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    const { chain } = await resolveChain(app.ctx, request.tenantId);
    return { items: rows.map(providerDto), chain, cloudRelayAvailable: config.isEdge && !!config.cloudApiUrl };
  });

  app.post('/providers', { preHandler: admin }, async (request, reply) => {
    const body = parse(providerConfigSchema, request.body);
    const tenantId = scopeOf(request);
    const row = await db.providerConfig.create({
      data: {
        tenantId,
        type: body.type,
        name: body.name,
        apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey, config.ENCRYPTION_KEY) : null,
        apiKeyHint: body.apiKey ? apiKeyHint(body.apiKey) : null,
        baseUrl: body.baseUrl ?? null,
        model: body.model ?? null,
        priority: body.priority,
        enabled: body.enabled,
        options: (body.options ?? {}) as never,
      },
    });
    await audit(db, tenantId, actorOf(request), 'provider.create', 'ProviderConfig', row.id, null, { type: row.type, name: row.name });
    return reply.code(201).send(providerDto(row));
  });

  app.patch('/providers/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(providerConfigSchema.partial(), request.body);
    const before = await db.providerConfig.findUnique({ where: { id } });
    if (!before) throw notFound('Provider');
    if (before.tenantId === null && request.user!.role !== 'SUPER_ADMIN') throw forbidden('Global providers are managed by the platform');
    if (before.tenantId !== null && before.tenantId !== request.tenantId) throw notFound('Provider');
    const row = await db.providerConfig.update({
      where: { id },
      data: {
        name: body.name,
        baseUrl: body.baseUrl,
        model: body.model,
        priority: body.priority,
        enabled: body.enabled,
        options: body.options as never,
        ...(body.apiKey !== undefined
          ? body.apiKey
            ? { apiKeyEncrypted: encryptSecret(body.apiKey, config.ENCRYPTION_KEY), apiKeyHint: apiKeyHint(body.apiKey) }
            : { apiKeyEncrypted: null, apiKeyHint: null }
          : {}),
      },
    });
    await audit(db, before.tenantId, actorOf(request), 'provider.update', 'ProviderConfig', id, providerDto(before), providerDto(row));
    return providerDto(row);
  });

  app.delete('/providers/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const before = await db.providerConfig.findUnique({ where: { id } });
    if (!before) throw notFound('Provider');
    if (before.tenantId === null && request.user!.role !== 'SUPER_ADMIN') throw forbidden();
    if (before.tenantId !== null && before.tenantId !== request.tenantId) throw notFound('Provider');
    await db.providerConfig.delete({ where: { id } });
    await audit(db, before.tenantId, actorOf(request), 'provider.delete', 'ProviderConfig', id, providerDto(before), null);
    return { ok: true };
  });

  /** Health check + tiny sample translation. */
  app.post('/providers/:id/test', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const cfg = await db.providerConfig.findFirst({ where: { id, OR: [{ tenantId: request.tenantId }, { tenantId: null }] } });
    if (!cfg) throw notFound('Provider');
    const body = parse(providerTestSchema, request.body);
    const started = Date.now();
    try {
      const provider = providerFromConfig(app.ctx, cfg);
      const health = await provider.healthCheck(AbortSignal.timeout(15000));
      let sample: string | null = null;
      let sampleError: string | null = null;
      if (health.ok && cfg.type !== 'MANUAL') {
        try {
          const res = await provider.translate({ items: [{ id: 't', text: body.text }], sourceLang: 'ar', targetLang: body.targetLang, glossary: await loadGlossary(db, request.tenantId), signal: AbortSignal.timeout(60000) });
          sample = res.items[0]?.text ?? null;
        } catch (err) {
          sampleError = (err as Error).message;
        }
      }
      const ok = health.ok && !sampleError;
      await db.providerConfig.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: ok } });
      return { ok, health, sample, sampleError, latencyMs: Date.now() - started };
    } catch (err) {
      await db.providerConfig.update({ where: { id }, data: { lastTestedAt: new Date(), lastTestOk: false } });
      return { ok: false, health: { ok: false, message: (err as Error).message }, sample: null, sampleError: (err as Error).message, latencyMs: Date.now() - started };
    }
  });

  /** Set the ordered fallback chain for the tenant. */
  app.put('/providers/chain', { preHandler: admin }, async (request) => {
    const body = parse(z.object({ chain: z.array(z.string()).max(10) }), request.body);
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId } });
    const settings = { ...(t.settings as object), defaultProviderChain: body.chain as ProviderType[] };
    await db.tenant.update({ where: { id: t.id }, data: { settings } });
    await audit(db, t.id, actorOf(request), 'provider.chain.update', 'Tenant', t.id, null, body.chain);
    const { chain } = await resolveChain(app.ctx, t.id);
    return { chain };
  });

  app.get('/providers/health', { preHandler: admin }, async (request) => {
    const { providers } = await resolveChain(app.ctx, request.tenantId);
    const results = await Promise.all(providers.map(async (p) => ({ type: p.type, name: p.name, ...(await p.healthCheck(AbortSignal.timeout(8000))) })));
    return results;
  });
}
