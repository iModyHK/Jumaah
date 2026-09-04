import type { FastifyInstance } from 'fastify';
import { buildTenantPublicInfo } from '../lib/live-payload.js';
import { notFound } from '../lib/errors.js';
import { idParam } from '../lib/validate.js';
import { displayConfigOf } from '../realtime/socket.js';
import { getLiveKhutbah, getSnapshot } from '../services/session.service.js';

/** Unauthenticated endpoints used by display screens and the public mobile page (bootstrap before the socket connects). */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get('/public/display/:token', async (request) => {
    const token = idParam(request.params, 'token');
    const d = await db.display.findUnique({ where: { token }, include: { tenant: { select: { slug: true, isActive: true } } } });
    if (!d || !d.tenant.isActive) throw notFound('Display');
    const [tenant, session] = await Promise.all([buildTenantPublicInfo(db, d.tenantId), getSnapshot(app.ctx, d.tenantId)]);
    const khutbah = session.khutbahId ? await getLiveKhutbah(app.ctx, d.tenantId, session.khutbahId) : null;
    return { display: displayConfigOf(d, config.PUBLIC_BASE_URL, d.tenant.slug), tenant, session, khutbah, serverTime: Date.now() };
  });

  app.get('/public/tenant/:slug', async (request) => {
    const slug = idParam(request.params, 'slug');
    const t = await db.tenant.findUnique({ where: { slug } });
    const enabled = (t?.settings as { publicDisplayEnabled?: boolean })?.publicDisplayEnabled !== false;
    if (!t || !t.isActive || !enabled) throw notFound('Mosque');
    const [tenant, session] = await Promise.all([buildTenantPublicInfo(db, t.id), getSnapshot(app.ctx, t.id)]);
    const khutbah = session.khutbahId ? await getLiveKhutbah(app.ctx, t.id, session.khutbahId) : null;
    return { tenant, session, khutbah, serverTime: Date.now() };
  });
}
