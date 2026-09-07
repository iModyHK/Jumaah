import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@jumaah/db';
import { createTenantSchema, paginationSchema, tenantLanguagesSchema, updateTenantSchema } from '@jumaah/core';
import { audit, outbox } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { tenantDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { actorOf } from './auth.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { assertBrandingAllowed, assertSignageAllowed, tenantFeatures } from '../services/features.service.js';
import { buildTenantPublicInfo } from '../lib/live-payload.js';
import { createTenantWithAdmin } from '../services/tenant.service.js';

/** Super-admin tenant management + current-tenant settings. */
export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, hooks } = app.ctx;
  const superOnly = app.requireRole('SUPER_ADMIN');
  const dto = (t: Parameters<typeof tenantDto>[0]) => tenantDto(t, hooks.tenantDtoExt?.(t));

  app.get('/tenants', { preHandler: superOnly }, async (request) => {
    const q = parse(paginationSchema, request.query);
    const where = q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { slug: { contains: q.q } }] } : {};
    const [items, total] = await Promise.all([
      db.tenant.findMany({ where, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.tenant.count({ where }),
    ]);
    return { items: items.map(dto), total, page: q.page, pageSize: q.pageSize };
  });

  app.post('/tenants', { preHandler: superOnly }, async (request, reply) => {
    // Extension fields pass through to the tenantCreateData hook.
    const body = parse(createTenantSchema.passthrough(), request.body);
    const { tenant, password, generatedPassword, secrets } = await createTenantWithAdmin(app.ctx, { ...body, adminPassword: body.adminPassword }, actorOf(request));
    return reply.code(201).send({ tenant: dto(tenant), adminPassword: generatedPassword ? password : undefined, ...secrets });
  });

  app.get('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const t = await db.tenant.findUnique({ where: { id: idParam(request.params) }, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } } });
    if (!t) throw notFound('Tenant');
    return dto(t);
  });

  app.patch('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateTenantSchema, request.body);
    const before = await db.tenant.findUnique({ where: { id } });
    if (!before) throw notFound('Tenant');
    if (body.settings) hooks.validateTenantSettings?.(before, body.settings);
    const t = await db.tenant.update({
      where: { id },
      data: {
        name: body.name,
        timezone: body.timezone,
        locale: body.locale,
        librarySharingAllowed: body.librarySharingAllowed,
        settings: body.settings ? ({ ...(before.settings as object), ...body.settings } as Prisma.InputJsonObject) : undefined,
      },
      include: { languages: true },
    });
    await audit(db, id, actorOf(request), 'tenant.update', 'Tenant', id, before, t);
    await outbox(db, id, 'Tenant', id, 'UPSERT', t);
    return dto(t);
  });

  /** Suspend a mosque: nobody can sign in, screens stop; nothing is deleted. */
  app.delete('/tenants/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Tenant');
    await db.tenant.update({ where: { id }, data: { isActive: false } });
    await audit(db, id, actorOf(request), 'tenant.suspend', 'Tenant', id, { isActive: true }, { isActive: false });
    return { ok: true };
  });

  /** Issue a short-lived MOSQUE_ADMIN token scoped to a tenant (audited). */
  app.post('/tenants/:id/impersonate', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id } });
    if (!t) throw notFound('Tenant');
    const token = await signAccessToken(config.JWT_SECRET, { sub: request.user!.id, email: request.user!.email, role: 'MOSQUE_ADMIN', tid: id, imp: request.user!.id }, 3600);
    await audit(db, id, actorOf(request), 'tenant.impersonate', 'Tenant', id);
    return { accessToken: token, expiresIn: 3600, tenant: dto({ ...t, languages: [] }) };
  });

  // ---- Current tenant (mosque admin) ----
  app.get('/tenant', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM') }, async (request) => {
    const t = await db.tenant.findUnique({ where: { id: request.tenantId }, include: { languages: true, _count: { select: { users: true, khutbahs: true, displays: true } } } });
    if (!t) throw notFound('Tenant');
    return dto(t);
  });

  app.patch('/tenant', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const body = parse(updateTenantSchema.omit({ librarySharingAllowed: true }), request.body);
    const before = await db.tenant.findUnique({ where: { id: request.tenantId } });
    if (!before) throw notFound('Tenant');
    // Branding and signage are only accepted when the mosque's features include them (clearing is always fine);
    // an extension validates the settings keys it owns.
    const { features } = tenantFeatures(app.ctx, before);
    assertBrandingAllowed(body.settings?.branding, features);
    assertSignageAllowed(body.settings?.signage, features);
    if (body.settings) hooks.validateTenantSettings?.(before, body.settings);
    const mergedBranding = body.settings?.branding ? { ...(((before.settings as { branding?: object }).branding) ?? {}), ...body.settings.branding } : undefined;
    const settings = body.settings ? { ...(before.settings as object), ...body.settings, ...(mergedBranding ? { branding: mergedBranding } : {}) } : undefined;
    const t = await db.tenant.update({
      where: { id: request.tenantId },
      data: { name: body.name, timezone: body.timezone, locale: body.locale, settings },
      include: { languages: true },
    });
    await audit(db, t.id, actorOf(request), 'tenant.settings.update', 'Tenant', t.id, before.settings, t.settings);
    await outbox(db, t.id, 'Tenant', t.id, 'UPSERT', t);
    const info = await buildTenantPublicInfo(app.ctx, t.id);
    if (info) app.ctx.io.to(`t:${t.id}`).emit('tenant:info', info);
    return dto(t);
  });

  /** Features the mosque may use right now (plus whatever an extension adds). */
  app.get('/tenant/features', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM') }, async (request) => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId } });
    const f = tenantFeatures(app.ctx, t);
    return { features: f.features, ...(f.ext ?? {}) };
  });

  app.get('/tenant/languages', { preHandler: app.requireRole('SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM') }, async (request) => {
    const rows = await db.tenantLanguage.findMany({ where: { tenantId: request.tenantId }, orderBy: { order: 'asc' } });
    return rows.map((l) => ({ code: l.code, enabled: l.enabled, order: l.order }));
  });

  app.put('/tenant/languages', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const body = parse(tenantLanguagesSchema, request.body);
    const tenantId = request.tenantId;
    await db.$transaction(async (tx) => {
      const before = await tx.tenantLanguage.findMany({ where: { tenantId }, select: { code: true } });
      await tx.tenantLanguage.deleteMany({ where: { tenantId } });
      const kept = new Set<string>();
      for (let i = 0; i < body.languages.length; i++) {
        const l = body.languages[i];
        kept.add(l.code);
        const row = await tx.tenantLanguage.create({ data: { tenantId, code: l.code, enabled: l.enabled, order: i } });
        await outbox(tx, tenantId, 'TenantLanguage', `${tenantId}:${l.code}`, 'UPSERT', row);
      }
      // Languages removed here must also disappear on the other side of the sync, so record a DELETE for each.
      for (const { code } of before) {
        if (!kept.has(code)) await outbox(tx, tenantId, 'TenantLanguage', `${tenantId}:${code}`, 'DELETE', { code });
      }
    });
    await audit(db, tenantId, actorOf(request), 'tenant.languages.update', 'Tenant', tenantId, null, body.languages);
    return body.languages;
  });

  // ---- Server-level ----
  app.get('/platform/stats', { preHandler: superOnly }, async () => {
    const [tenants, users, khutbahs, displays, activeSessions] = await Promise.all([
      db.tenant.count({ where: { isActive: true } }),
      db.user.count(),
      db.khutbah.count({ where: { deletedAt: null } }),
      db.display.count(),
      db.liveSession.count({ where: { endedAt: null } }),
    ]);
    const extra = (await hooks.platformStats?.(app.ctx)) ?? {};
    return { tenants, users, khutbahs, displays, activeSessions, imageTag: config.IMAGE_TAG, mode: hooks.mode ?? 'community', ...extra };
  });
}
