import type { FastifyInstance } from 'fastify';
import { cloudTenantUpdateSchema } from '@jumaah/cloud-shared';
import { randomToken, sha256 } from '@jumaah/cloud-db';
import { actorOf, audit, idParam, notFound, outbox, parse, tenantDto } from '@jumaah/api';
import { cloudCtx } from '../context.js';
import { forgetCustomDomain } from '../services/domain.service.js';
import { allowanceOf, getAiAllowance, monthKey } from '../services/plan.service.js';

/** What the hosted edition adds to mosque management: plans, sync keys, the AI allowance and platform settings. */
export async function tenantCloudRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db, config, hooks } = ctx;
  const superOnly = app.requireRole('SUPER_ADMIN');

  /** Plan, subscription state and paid-until date of a mosque (manual billing by the super admin). */
  app.patch('/tenants/:id/subscription', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const body = parse(cloudTenantUpdateSchema, request.body);
    const before = await db.tenant.findUnique({ where: { id } });
    if (!before) throw notFound('Tenant');
    const t = await db.tenant.update({
      where: { id },
      data: { plan: body.plan, subscriptionStatus: body.subscriptionStatus, subscriptionEndsAt: body.subscriptionEndsAt === undefined ? undefined : body.subscriptionEndsAt ? new Date(body.subscriptionEndsAt) : null },
      include: { languages: true },
    });
    await audit(db as never, id, actorOf(request), 'tenant.subscription.update', 'Tenant', id, { plan: before.plan, subscriptionStatus: before.subscriptionStatus, subscriptionEndsAt: before.subscriptionEndsAt }, { plan: t.plan, subscriptionStatus: t.subscriptionStatus, subscriptionEndsAt: t.subscriptionEndsAt });
    await outbox(db as never, id, 'Tenant', id, 'UPSERT', t);
    return tenantDto(t as never, hooks.tenantDtoExt?.(t));
  });

  /** Suspending a mosque on the cloud also marks the subscription and releases its custom domain. */
  app.addHook('onSend', async () => undefined);
  app.post('/tenants/:id/suspend', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Tenant');
    await db.tenant.update({ where: { id }, data: { isActive: false, subscriptionStatus: 'SUSPENDED', customDomain: null, customDomainVerifiedAt: null } });
    await forgetCustomDomain(ctx, t.customDomain);
    await audit(db as never, id, actorOf(request), 'tenant.suspend', 'Tenant', id, { isActive: true, customDomain: t.customDomain }, { isActive: false, customDomain: null });
    return { ok: true };
  });

  app.post('/tenants/:id/sync-key', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const syncKey = randomToken(24);
    await db.tenant.update({ where: { id }, data: { syncKeyHash: sha256(syncKey) } });
    await audit(db as never, id, actorOf(request), 'tenant.syncKey.rotate', 'Tenant', id);
    return { syncKey };
  });

  /** The mosque's platform-AI allowance and usage this month. */
  app.get('/tenant/ai-usage', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR') }, async (request) => getAiAllowance(ctx, request.tenantId));

  /** Every mosque's plan, subscription state and platform-AI usage this month, for manual billing. */
  app.get('/platform/ai-usage', { preHandler: superOnly }, async () => {
    const month = monthKey();
    const [tenants, usage] = await Promise.all([
      db.tenant.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true }, orderBy: { name: 'asc' } }),
      db.aiUsage.groupBy({ by: ['tenantId'], where: { month }, _sum: { paragraphs: true } }),
    ]);
    const used = new Map(usage.map((u) => [u.tenantId, u._sum.paragraphs ?? 0]));
    const items = tenants.map((t) => {
      const a = allowanceOf(t, used.get(t.id) ?? 0, config.isCloud);
      return { id: t.id, name: t.name, slug: t.slug, plan: a.plan, status: a.status, state: a.state, endsAt: a.endsAt, graceEndsAt: a.graceEndsAt, aiIncluded: a.aiIncluded, usedParagraphs: a.usedParagraphs, monthlyParagraphs: a.monthlyParagraphs, allowed: a.allowed, reason: a.reason };
    });
    return { month, applies: true, items };
  });

  app.get('/platform/settings', { preHandler: superOnly }, async () => {
    const rows = await db.platformSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/platform/settings/:key', { preHandler: superOnly }, async (request) => {
    const key = idParam(request.params, 'key');
    const value = (request.body as { value: unknown })?.value;
    const row = await db.platformSetting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
    await audit(db as never, null, actorOf(request), 'platform.setting.update', 'PlatformSetting', key, null, value);
    return { key: row.key, value: row.value };
  });
}
