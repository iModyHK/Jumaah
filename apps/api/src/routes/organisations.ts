import type { FastifyInstance } from 'fastify';
import { createOrganisationSchema, organisationAdminSchema, organisationTenantSchema, updateOrganisationSchema, type OrganisationDto } from '@jumaah/shared';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { forgetUserAuth } from '../plugins/auth.js';
import { forgetOrganisationMembers, listOrganisations, organisationDto } from '../services/organisation.service.js';
import { actorOf } from './auth.js';

/** Organisation accounts: super admins create them and attach mosques and admins; organisation admins read their own. */
export async function organisationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const superOnly = app.requireRole('SUPER_ADMIN');
  const orgOrThrow = async (id: string): Promise<OrganisationDto> => {
    const o = await organisationDto(db, id);
    if (!o) throw notFound('Organisation');
    return o;
  };

  app.get('/organisations', { preHandler: superOnly }, async () => listOrganisations(db));

  app.post('/organisations', { preHandler: superOnly }, async (request, reply) => {
    const body = parse(createOrganisationSchema, request.body);
    if (await db.organisation.findUnique({ where: { slug: body.slug } })) throw conflict('Slug already used');
    const o = await db.organisation.create({ data: body });
    await audit(db, null, actorOf(request), 'organisation.create', 'Organisation', o.id, null, { name: o.name, slug: o.slug });
    return reply.code(201).send(await orgOrThrow(o.id));
  });

  app.get('/organisations/:id', { preHandler: superOnly }, async (request) => orgOrThrow(idParam(request.params)));

  app.patch('/organisations/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateOrganisationSchema, request.body);
    const before = await db.organisation.findUnique({ where: { id } });
    if (!before) throw notFound('Organisation');
    if (body.slug && body.slug !== before.slug && (await db.organisation.findUnique({ where: { slug: body.slug } }))) throw conflict('Slug already used');
    const o = await db.organisation.update({ where: { id }, data: body });
    await audit(db, null, actorOf(request), 'organisation.update', 'Organisation', id, before, o);
    return orgOrThrow(id);
  });

  /** Deleting detaches its mosques and admins (foreign keys are SET NULL); the mosques keep their plan. */
  app.delete('/organisations/:id', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const before = await db.organisation.findUnique({ where: { id }, include: { _count: { select: { tenants: { where: { isActive: true } } } } } });
    if (!before) throw notFound('Organisation');
    if (before._count.tenants > 0) throw badRequest('Remove the mosques from the organisation first');
    await db.user.updateMany({ where: { organisationId: id }, data: { organisationId: null } });
    await db.tenant.updateMany({ where: { organisationId: id }, data: { organisationId: null } });
    await db.organisation.delete({ where: { id } });
    await forgetOrganisationMembers(app.ctx, id);
    await audit(db, null, actorOf(request), 'organisation.delete', 'Organisation', id, { name: before.name }, null);
    return { ok: true };
  });

  /** Attach a mosque: it must be free, the organisation must have room, and it moves to the ENTERPRISE plan. */
  app.post('/organisations/:id/tenants', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const { tenantId } = parse(organisationTenantSchema, request.body);
    const [o, t] = await Promise.all([db.organisation.findUnique({ where: { id }, include: { _count: { select: { tenants: { where: { isActive: true } } } } } }), db.tenant.findUnique({ where: { id: tenantId } })]);
    if (!o) throw notFound('Organisation');
    if (!t) throw notFound('Tenant');
    if (t.organisationId && t.organisationId !== id) throw conflict('Mosque already belongs to another organisation');
    if (!t.organisationId && o._count.tenants >= o.maxTenants) throw conflict(`Organisation is full (${o.maxTenants} mosques)`, { maxTenants: o.maxTenants });
    await db.tenant.update({ where: { id: tenantId }, data: { organisationId: id, plan: 'ENTERPRISE' } });
    await forgetOrganisationMembers(app.ctx, id);
    await audit(db, tenantId, actorOf(request), 'organisation.tenant.add', 'Tenant', tenantId, { organisationId: t.organisationId, plan: t.plan }, { organisationId: id, plan: 'ENTERPRISE' });
    return orgOrThrow(id);
  });

  /** Detach a mosque; its admins lose organisation rights over it, the plan is left for the super admin to set. */
  app.delete('/organisations/:id/tenants/:tenantId', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const tenantId = idParam(request.params, 'tenantId');
    const t = await db.tenant.findFirst({ where: { id: tenantId, organisationId: id } });
    if (!t) throw notFound('Tenant');
    await db.tenant.update({ where: { id: tenantId }, data: { organisationId: null } });
    // Admins who belonged to this mosque cannot keep organisation rights from outside it.
    const affected = await db.user.findMany({ where: { tenantId, organisationId: id }, select: { id: true } });
    await db.user.updateMany({ where: { tenantId, organisationId: id }, data: { organisationId: null } });
    await Promise.all([forgetOrganisationMembers(app.ctx, id), forgetUserAuth(app.ctx, affected.map((u) => u.id))]);
    await audit(db, tenantId, actorOf(request), 'organisation.tenant.remove', 'Tenant', tenantId, { organisationId: id }, { organisationId: null });
    return orgOrThrow(id);
  });

  /** Make a mosque admin of a member mosque an organisation admin (takes effect on their next request). */
  app.post('/organisations/:id/admins', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const { email } = parse(organisationAdminSchema, request.body);
    const o = await db.organisation.findUnique({ where: { id } });
    if (!o) throw notFound('Organisation');
    const user = await db.user.findFirst({ where: { email: email.toLowerCase(), isActive: true, role: 'MOSQUE_ADMIN', tenant: { organisationId: id } } });
    if (!user) throw notFound('No mosque admin with this email in a member mosque');
    await db.user.update({ where: { id: user.id }, data: { organisationId: id } });
    await forgetUserAuth(app.ctx, [user.id]);
    await audit(db, user.tenantId, actorOf(request), 'organisation.admin.add', 'User', user.id, null, { organisationId: id });
    return orgOrThrow(id);
  });

  app.delete('/organisations/:id/admins/:userId', { preHandler: superOnly }, async (request) => {
    const id = idParam(request.params);
    const userId = idParam(request.params, 'userId');
    const user = await db.user.findFirst({ where: { id: userId, organisationId: id } });
    if (!user) throw notFound('User');
    await db.user.update({ where: { id: userId }, data: { organisationId: null } });
    await forgetUserAuth(app.ctx, [userId]);
    await audit(db, user.tenantId, actorOf(request), 'organisation.admin.remove', 'User', userId, { organisationId: id }, null);
    return orgOrThrow(id);
  });

  // ---- Organisation admins: their own organisation ----
  app.get('/organisation', { preHandler: app.authenticate }, async (request) => {
    const oid = request.user!.organisationId;
    if (!oid) throw forbidden('Not an organisation admin');
    return orgOrThrow(oid);
  });
}
