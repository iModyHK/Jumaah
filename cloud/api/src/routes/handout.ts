import type { FastifyInstance } from 'fastify';
import type { HandoutDto } from '@jumaah/cloud-shared';
import { ALL_STAFF, effectiveBranding, getLiveKhutbah, idParam, notFound } from '@jumaah/api';
import { cloudCtx } from '../context.js';
import { assertFeature, tenantFeatures } from '../services/features.js';
import { coreCtx } from '../context.js';

/** Printable handout: the khutbah with approved translations plus the mosque header (plans with handouts). */
export async function handoutRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db } = ctx;
  app.get('/khutbahs/:id/handout', { preHandler: app.requireRole(...ALL_STAFF) }, async (request): Promise<HandoutDto> => {
    const t = await db.tenant.findUnique({ where: { id: request.tenantId } });
    if (!t) throw notFound('Tenant');
    assertFeature('handouts', t);
    const k = await getLiveKhutbah(app.ctx, request.tenantId, idParam(request.params));
    if (!k) throw notFound('Khutbah');
    const s = (t.settings as Record<string, unknown>) ?? {};
    return { tenant: { name: t.name, locale: t.locale as 'ar' | 'en', logoUrl: effectiveBranding(s, tenantFeatures(t).features).logoUrl }, khutbah: k };
  });
}
