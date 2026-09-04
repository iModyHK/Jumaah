import type { FastifyInstance } from 'fastify';
import { randomToken } from '@jumaah/db';
import { displaySchema } from '@jumaah/shared';
import { audit, outbox } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { displayDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ADMIN_ROLES, ALL_STAFF } from '../plugins/auth.js';
import { displayConfigOf } from '../realtime/socket.js';
import { actorOf } from './auth.js';

export async function displayRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, io } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);

  const withUrls = (d: Parameters<typeof displayDto>[0], slug: string) => ({
    ...displayDto(d),
    url: `${config.PUBLIC_BASE_URL}/display/${d.token}`,
    publicUrl: `${config.PUBLIC_BASE_URL}/display/m/${slug}`,
  });

  app.get('/displays', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId }, select: { slug: true } });
    const rows = await db.display.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'asc' } });
    return rows.map((d) => withUrls(d, t.slug));
  });

  app.post('/displays', { preHandler: admin }, async (request, reply) => {
    const body = parse(displaySchema, request.body);
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId }, select: { slug: true } });
    const row = await db.display.create({ data: { tenantId: request.tenantId, token: randomToken(18), ...body } });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.create', 'Display', row.id, null, { name: row.name, languages: row.languages });
    return reply.code(201).send(withUrls(row, t.slug));
  });

  app.patch('/displays/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(displaySchema.partial(), request.body);
    const before = await db.display.findFirst({ where: { id, tenantId: request.tenantId }, include: { tenant: { select: { slug: true } } } });
    if (!before) throw notFound('Display');
    const row = await db.display.update({ where: { id }, data: body });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.update', 'Display', id, displayDto(before), displayDto(row));
    // Push new config to the connected screen immediately.
    const sockets = await io.in(`t:${request.tenantId}:displays`).fetchSockets();
    for (const s of sockets) if (s.data.displayId === id) s.emit('display:config', displayConfigOf(row, config.PUBLIC_BASE_URL, before.tenant.slug));
    return withUrls(row, before.tenant.slug);
  });

  app.post('/displays/:id/regenerate-token', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const before = await db.display.findFirst({ where: { id, tenantId: request.tenantId }, include: { tenant: { select: { slug: true } } } });
    if (!before) throw notFound('Display');
    const row = await db.display.update({ where: { id }, data: { token: randomToken(18) } });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.token.regenerate', 'Display', id);
    const sockets = await io.in(`t:${request.tenantId}:displays`).fetchSockets();
    for (const s of sockets) if (s.data.displayId === id) s.disconnect(true);
    return withUrls(row, before.tenant.slug);
  });

  app.delete('/displays/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const before = await db.display.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!before) throw notFound('Display');
    await db.display.delete({ where: { id } });
    await outbox(db, request.tenantId, 'Display', id, 'DELETE', { id });
    await audit(db, request.tenantId, actorOf(request), 'display.delete', 'Display', id, displayDto(before), null);
    const sockets = await io.in(`t:${request.tenantId}:displays`).fetchSockets();
    for (const s of sockets) if (s.data.displayId === id) s.disconnect(true);
    return { ok: true };
  });
}
