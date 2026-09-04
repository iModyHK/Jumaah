import type { FastifyInstance } from 'fastify';
import { hashPassword, randomToken, sha256 } from '@jumaah/db';
import { createTenantSchema, paginationSchema, tenantLanguagesSchema, updateTenantSchema } from '@jumaah/shared';
import { audit, outbox } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { tenantDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { actorOf } from './auth.js';
import { ADMIN_ROLES } from '../plugins/auth.js';

/** Super-admin tenant management + current-tenant settings. */
export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;
  const superOnly = app.requireRole('SUPER_ADMIN');

  app.get('/tenants', { preHandler: superOnly }, async (request) => {
    const q = parse(paginationSchema, request.query);
    const where = q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { slug: { contains: q.q } }] } : {};
    const [items, total] = await Promise.all([
      db.tenant.findMany({ where, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.tenant.count({ where }),
    ]);
    return { items: items.map(tenantDto), total, page: q.page, pageSize: q.pageSize };
  });

  app.post('/tenants', { preHandler: superOnly }, async (request, reply) => {
    const body = parse(createTenantSchema, request.body);
    if (await db.tenant.findUnique({ where: { slug: body.slug } })) throw conflict('Slug already used');
    const syncKey = randomToken(24);
    const password = body.adminPassword ?? randomToken(9);
    const tenant = await db.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug,
          timezone: body.timezone,
          locale: body.locale,
          plan: (body.plan as never) ?? 'FREE',
          subscriptionStatus: 'TRIAL',
          syncKeyHash: sha256(syncKey),
          languages: { create: body.languages.map((code, i) => ({ code, order: i })) },
        },
        include: { languages: true },
      });
      await tx.user.create({ data: { tenantId: t.id, email: body.adminEmail.toLowerCase(), name: body.adminName, role: 'MOSQUE_ADMIN', passwordHash: await hashPassword(password) } });
      await tx.syncState.create({ data: { tenantId: t.id, deviceId: 'cloud' } });
      return t;
    });
    await audit(db, tenant.id, actorOf(request), 'tenant.create', 'Tenant', tenant.id, null, { name: tenant.name, slug: tenant.slug });
    return reply.code(201).send({ tenant: tenantDto(tenant), syncKey, adminPassword: body.adminPassword ? undefined : password });
  });

  app.get('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const t = await db.tenant.findUnique({ where: { id: idParam(request.params) }, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } } });
    if (!t) throw notFound('Tenant');
    return tenantDto(t);
  });

  app.patch('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateTenantSchema, request.body);
    const before = await db.tenant.findUnique({ where: { id } });
    if (!before) throw notFound('Tenant');
    const t = await db.tenant.update({
      where: { id },
      data: {
        name: body.name,
        timezone: body.timezone,
        locale: body.locale,
        plan: body.plan,
        subscriptionStatus: body.subscriptionStatus,
        subscriptionEndsAt: body.subscriptionEndsAt === undefined ? undefined : body.subscriptionEndsAt ? new Date(body.subscriptionEndsAt) : null,
        librarySharingAllowed: body.librarySharingAllowed,
        settings: body.settings ? { ...(before.settings as object), ...body.settings } : undefined,
      },
      include: { languages: true },
    });
    await audit(db, id, actorOf(request), 'tenant.update', 'Tenant', id, before, t);
    await outbox(db, id, 'Tenant', id, 'UPSERT', t);
    return tenantDto(t);
  });

  app.delete('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Tenant');
    await db.tenant.update({ where: { id }, data: { isActive: false, subscriptionStatus: 'SUSPENDED' } });
    await audit(db, id, actorOf(request), 'tenant.suspend', 'Tenant', id, { isActive: true }, { isActive: false });
    return { ok: true };
  });

  app.post('/tenants/:id/sync-key', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const syncKey = randomToken(24);
    await db.tenant.update({ where: { id }, data: { syncKeyHash: sha256(syncKey) } });
    await audit(db, id, actorOf(request), 'tenant.syncKey.rotate', 'Tenant', id);
    return { syncKey };
  });

  /** Issue a short-lived MOSQUE_ADMIN token scoped to a tenant (audited). */
  app.post('/tenants/:id/impersonate', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Tenant');
    const token = await signAccessToken(config.JWT_SECRET, { sub: request.user!.id, email: request.user!.email, role: 'MOSQUE_ADMIN', tid: id, imp: request.user!.id }, 3600);
    await audit(db, id, actorOf(request), 'tenant.impersonate', 'Tenant', id);
    return { accessToken: token, expiresIn: 3600, tenant: tenantDto({ ...t, languages: [] }) };
  });

  // ---- Current tenant (mosque admin) ----
  app.get('/tenant', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM') }, async (request) => {
    const t = await db.tenant.findUnique({ where: { id: request.tenantId }, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } } });
    if (!t) throw notFound('Tenant');
    return tenantDto(t);
  });

  app.patch('/tenant', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const body = parse(updateTenantSchema.omit({ plan: true, subscriptionStatus: true, subscriptionEndsAt: true, librarySharingAllowed: true }), request.body);
    const before = await db.tenant.findUnique({ where: { id: request.tenantId } });
    if (!before) throw notFound('Tenant');
    const t = await db.tenant.update({
      where: { id: request.tenantId },
      data: { name: body.name, timezone: body.timezone, locale: body.locale, settings: body.settings ? { ...(before.settings as object), ...body.settings } : undefined },
      include: { languages: true },
    });
    await audit(db, t.id, actorOf(request), 'tenant.settings.update', 'Tenant', t.id, before.settings, t.settings);
    await outbox(db, t.id, 'Tenant', t.id, 'UPSERT', t);
    app.ctx.io.to(`t:${t.id}`).emit('tenant:info', {
      id: t.id, name: t.name, slug: t.slug, locale: t.locale as 'ar' | 'en', timezone: t.timezone,
      logoUrl: ((t.settings as { logoUrl?: string }).logoUrl) ?? null,
      welcomeMessage: ((t.settings as { welcomeMessage?: string }).welcomeMessage) ?? null,
      welcomeMessageEn: ((t.settings as { welcomeMessageEn?: string }).welcomeMessageEn) ?? null,
      prayerTimes: ((t.settings as { prayerTimes?: Record<string, string> }).prayerTimes) ?? null,
      languages: t.languages.filter((l) => l.enabled).map((l) => l.code),
    });
    return tenantDto(t);
  });

  app.get('/tenant/languages', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM') }, async (request) => {
    const rows = await db.tenantLanguage.findMany({ where: { tenantId: request.tenantId }, orderBy: { order: 'asc' } });
    return rows.map((l) => ({ code: l.code, enabled: l.enabled, order: l.order }));
  });

  app.put('/tenant/languages', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const body = parse(tenantLanguagesSchema, request.body);
    const tenantId = request.tenantId;
    await db.$transaction(async (tx) => {
      await tx.tenantLanguage.deleteMany({ where: { tenantId } });
      for (let i = 0; i < body.languages.length; i++) {
        const l = body.languages[i];
        const row = await tx.tenantLanguage.create({ data: { tenantId, code: l.code, enabled: l.enabled, order: i } });
        await outbox(tx, tenantId, 'TenantLanguage', `${tenantId}:${l.code}`, 'UPSERT', row);
      }
    });
    await audit(db, tenantId, actorOf(request), 'tenant.languages.update', 'Tenant', tenantId, null, body.languages);
    return body.languages;
  });

  // ---- Platform-level ----
  app.get('/platform/stats', { preHandler: superOnly }, async () => {
    const [tenants, users, khutbahs, displays, activeSessions] = await Promise.all([
      db.tenant.count({ where: { isActive: true } }),
      db.user.count(),
      db.khutbah.count({ where: { deletedAt: null } }),
      db.display.count(),
      db.liveSession.count({ where: { endedAt: null } }),
    ]);
    const latest = await db.platformSetting.findUnique({ where: { key: 'edge.latestImageTag' } });
    return { tenants, users, khutbahs, displays, activeSessions, latestImageTag: (latest?.value as { tag?: string })?.tag ?? config.IMAGE_TAG, imageTag: config.IMAGE_TAG, mode: config.DEPLOYMENT_MODE };
  });

  app.get('/platform/settings', { preHandler: superOnly }, async () => {
    const rows = await db.platformSetting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put('/platform/settings/:key', { preHandler: superOnly }, async (request) => {
    const key = idParam(request.params, 'key');
    const value = (request.body as { value: unknown })?.value;
    const row = await db.platformSetting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
    await audit(db, null, actorOf(request), 'platform.setting.update', 'PlatformSetting', key, null, value);
    return { key: row.key, value: row.value };
  });
}
