import type { FastifyInstance } from 'fastify';
import { ALL_STAFF, notFound } from '@jumaah/api';
import { cloudCtx } from '../context.js';
import { assertFeature } from '../services/features.js';
import { listInsight } from '../services/insight.service.js';

/** Attendance insight: past sessions with peak screens, peak phones and distinct phones (plans with insight). */
export async function insightRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  app.get('/insight', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const t = await ctx.db.tenant.findUnique({ where: { id: request.tenantId } });
    if (!t) throw notFound('Tenant');
    assertFeature('insight', t);
    return listInsight(ctx.db, request.tenantId);
  });
}
