import type { FastifyInstance } from 'fastify';
import type { HostInfoDto } from '@jumaah/shared';
import { buildTenantPublicInfo } from '../lib/live-payload.js';
import { notFound } from '../lib/errors.js';
import { tenantPublicBaseUrl } from '../lib/host.js';
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
    return { display: displayConfigOf(d, tenantPublicBaseUrl(config, d.tenant.slug), d.tenant.slug), tenant, session, khutbah, serverTime: Date.now() };
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

  /**
   * What the address the browser used says about the mosque. On alnoor.jumaah.net this names the mosque so the
   * login pages can skip the "mosque" field and the phone page can open without a slug in the path.
   * On the platform address or an edge server it returns nulls, and the apps behave as before.
   */
  app.get('/public/host', async (request): Promise<HostInfoDto> => {
    const base: HostInfoDto = { tenantBaseDomain: config.tenantBaseDomain, slug: request.hostSlug, tenant: null };
    if (!request.hostSlug) return base;
    const t = await db.tenant.findUnique({ where: { slug: request.hostSlug }, select: { id: true, name: true, slug: true, locale: true, isActive: true } });
    if (!t || !t.isActive) return { ...base, slug: null };
    return { ...base, tenant: { id: t.id, name: t.name, slug: t.slug, locale: t.locale as 'ar' | 'en' } };
  });
}
