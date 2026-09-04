import type { FastifyInstance } from 'fastify';
import { paginationSchema, type AuditLogDto } from '@jumaah/shared';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/audit', { preHandler: app.requireRole(...ADMIN_ROLES) }, async (request) => {
    const q = parse(paginationSchema.extend({ entity: z.string().optional(), entityId: z.string().optional(), action: z.string().optional(), userId: z.string().optional() }), request.query);
    const isSuperGlobal = request.user!.role === 'SUPER_ADMIN' && !request.tenantId;
    const where = {
      ...(isSuperGlobal ? {} : { tenantId: request.tenantId }),
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({ where, include: { user: { select: { email: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.auditLog.count({ where }),
    ]);
    const items: AuditLogDto[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user?.email ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      before: r.before,
      after: r.after,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  });
}
