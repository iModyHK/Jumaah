import type { FastifyInstance } from 'fastify';
import { randomToken } from '@jumaah/db';
import { displaySchema } from '@jumaah/shared';
import { audit, outbox } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { tenantBaseUrlFor, type TenantAddress } from '../lib/host.js';
import { displayDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ADMIN_ROLES, ALL_STAFF } from '../plugins/auth.js';
import { displayConfigOf } from '../realtime/socket.js';
import { actorOf } from './auth.js';

export async function displayRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, io } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);

  const ADDRESS = { slug: true, customDomain: true, customDomainVerifiedAt: true } as const;
  const withUrls = (d: Parameters<typeof displayDto>[0], t: TenantAddress) => ({
    ...displayDto(d),
    url: `${tenantBaseUrlFor(config, t)}/display/${d.token}`,
    publicUrl: `${tenantBaseUrlFor(config, t)}/display/m/${t.slug}`,
  });

  app.get('/displays', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId }, select: ADDRESS });
    const rows = await db.display.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'asc' } });
    return rows.map((d) => withUrls(d, t));
  });

  app.post('/displays', { preHandler: admin }, async (request, reply) => {
    const body = parse(displaySchema, request.body);
    const t = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId }, select: ADDRESS });
    const row = await db.display.create({ data: { tenantId: request.tenantId, token: randomToken(18), ...body } });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.create', 'Display', row.id, null, { name: row.name, languages: row.languages });
    return reply.code(201).send(withUrls(row, t));
  });

  app.patch('/displays/:id', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const body = parse(displaySchema.partial(), request.body);
    const before = await db.display.findFirst({ where: { id, tenantId: request.tenantId }, include: { tenant: { select: ADDRESS } } });
    if (!before) throw notFound('Display');
    const row = await db.display.update({ where: { id }, data: body });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.update', 'Display', id, displayDto(before), displayDto(row));
    // Push new config to the connected screen immediately.
    const sockets = await io.in(`t:${request.tenantId}:displays`).fetchSockets();
    for (const s of sockets) if (s.data.displayId === id) s.emit('display:config', displayConfigOf(row, tenantBaseUrlFor(config, before.tenant), before.tenant.slug));
    return withUrls(row, before.tenant);
  });

  app.post('/displays/:id/regenerate-token', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const before = await db.display.findFirst({ where: { id, tenantId: request.tenantId }, include: { tenant: { select: ADDRESS } } });
    if (!before) throw notFound('Display');
    const row = await db.display.update({ where: { id }, data: { token: randomToken(18) } });
    await outbox(db, request.tenantId, 'Display', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'display.token.regenerate', 'Display', id);
    const sockets = await io.in(`t:${request.tenantId}:displays`).fetchSockets();
    for (const s of sockets) if (s.data.displayId === id) s.disconnect(true);
    return withUrls(row, before.tenant);
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
