import type { FastifyInstance } from 'fastify';
import { hashPassword, randomToken, sha256 } from '@jumaah/db';
import { createUserSchema, inviteUserSchema, paginationSchema, updateUserSchema } from '@jumaah/shared';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { userDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { actorOf } from './auth.js';

export async function userRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);

  app.get('/users', { preHandler: admin }, async (request) => {
    const q = parse(paginationSchema, request.query);
    const where = { tenantId: request.tenantId, ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { email: { contains: q.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([
      db.user.findMany({ where, orderBy: { createdAt: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.user.count({ where }),
    ]);
    return { items: items.map(userDto), total, page: q.page, pageSize: q.pageSize };
  });

  app.post('/users', { preHandler: admin }, async (request, reply) => {
    const body = parse(createUserSchema, request.body);
    const tenantId = request.user!.role === 'SUPER_ADMIN' && body.role === 'SUPER_ADMIN' ? null : request.tenantId;
    if (body.role === 'SUPER_ADMIN' && request.user!.role !== 'SUPER_ADMIN') throw forbidden();
    const email = body.email.toLowerCase();
    const existing = await db.user.findFirst({ where: { tenantId, email } });
    if (existing) throw conflict('Email already exists in this tenant');
    const u = await db.user.create({ data: { tenantId, email, name: body.name, role: body.role, passwordHash: await hashPassword(body.password) } });
    await audit(db, tenantId, actorOf(request), 'user.create', 'User', u.id, null, { email, role: body.role });
    return reply.code(201).send(userDto(u));
  });

  app.post('/users/invite', { preHandler: admin }, async (request, reply) => {
    const body = parse(inviteUserSchema, request.body);
    const email = body.email.toLowerCase();
    const token = randomToken(32);
    const inv = await db.invitation.create({
      data: { tenantId: request.tenantId, email, name: body.name ?? null, role: body.role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86400000), invitedBy: request.user!.id },
    });
    await audit(db, request.tenantId, actorOf(request), 'user.invite', 'Invitation', inv.id, null, { email, role: body.role });
    return reply.code(201).send({ id: inv.id, email, role: body.role, expiresAt: inv.expiresAt.toISOString(), inviteUrl: `${config.PUBLIC_BASE_URL}/admin/invite/${token}` });
  });

  app.get('/users/invitations', { preHandler: admin }, async (request) => {
    const rows = await db.invitation.findMany({ where: { tenantId: request.tenantId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    return rows.map((i) => ({ id: i.id, email: i.email, name: i.name, role: i.role, expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() }));
  });

  app.delete('/users/invitations/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    await db.invitation.deleteMany({ where: { id, tenantId: request.tenantId } });
    return { ok: true };
  });

  app.patch('/users/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateUserSchema, request.body);
    const u = await db.user.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!u) throw notFound('User');
    if (u.id === request.user!.id && body.isActive === false) throw badRequest('Cannot deactivate yourself');
    const updated = await db.user.update({
      where: { id },
      data: { name: body.name, role: body.role, isActive: body.isActive, passwordHash: body.password ? await hashPassword(body.password) : undefined },
    });
    if (body.isActive === false || body.password) await db.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await app.ctx.redis.del(`auth:user:${id}`);
    await audit(db, request.tenantId, actorOf(request), 'user.update', 'User', id, { role: u.role, isActive: u.isActive, name: u.name }, { role: updated.role, isActive: updated.isActive, name: updated.name });
    return userDto(updated);
  });

  app.delete('/users/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const u = await db.user.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!u) throw notFound('User');
    if (u.id === request.user!.id) throw badRequest('Cannot delete yourself');
    await db.user.delete({ where: { id } });
    await app.ctx.redis.del(`auth:user:${id}`);
    await audit(db, request.tenantId, actorOf(request), 'user.delete', 'User', id, { email: u.email }, null);
    return { ok: true };
  });
}
