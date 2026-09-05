import type { FastifyInstance } from 'fastify';
import type { ArchiveKhutbahDto, ArchiveListDto, HostInfoDto } from '@jumaah/shared';
import { buildTenantPublicInfo } from '../lib/live-payload.js';
import { notFound } from '../lib/errors.js';
import { tenantPublicBaseUrl } from '../lib/host.js';
import { idParam } from '../lib/validate.js';
import { displayConfigOf } from '../realtime/socket.js';
import { archiveEnabled } from '../services/features.service.js';
import { getLiveKhutbah, getSnapshot } from '../services/session.service.js';

/** Khutbahs that may appear in the public archive: delivered ones and those filed away afterwards. */
const ARCHIVE_STATUSES = ['DELIVERED', 'ARCHIVED'] as const;

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

  /** The mosque behind an archive address, or 404 when it has no open archive (plan or setting). Never leaks which. */
  const archiveTenant = async (slug: string) => {
    const t = await db.tenant.findUnique({ where: { slug } });
    if (!t || !t.isActive || !archiveEnabled((t.settings as Record<string, unknown>) ?? {}, t)) throw notFound('Archive');
    return t;
  };

  /** Public archive (paid editions): past khutbahs of a mosque, newest first. */
  app.get('/public/archive/:slug', async (request): Promise<ArchiveListDto> => {
    const t = await archiveTenant(idParam(request.params, 'slug'));
    const [tenant, rows] = await Promise.all([
      buildTenantPublicInfo(db, t.id),
      db.khutbah.findMany({
        where: { tenantId: t.id, deletedAt: null, status: { in: [...ARCHIVE_STATUSES] } },
        orderBy: { gregorianDate: 'desc' },
        take: 100,
        select: { id: true, title: true, hijriDate: true, gregorianDate: true, imamName: true, targetLanguages: true },
      }),
    ]);
    if (!tenant) throw notFound('Archive');
    return {
      tenant,
      items: rows.map((k) => ({ id: k.id, title: k.title, hijriDate: k.hijriDate, gregorianDate: k.gregorianDate.toISOString().slice(0, 10), imamName: k.imamName, languages: k.targetLanguages })),
    };
  });

  /** One archived khutbah: Arabic text and approved translations only (same payload the screens receive). */
  app.get('/public/archive/:slug/:id', async (request): Promise<ArchiveKhutbahDto> => {
    const t = await archiveTenant(idParam(request.params, 'slug'));
    const id = idParam(request.params, 'id');
    const k = await db.khutbah.findFirst({ where: { id, tenantId: t.id, deletedAt: null, status: { in: [...ARCHIVE_STATUSES] } }, select: { id: true } });
    if (!k) throw notFound('Khutbah');
    const [tenant, khutbah] = await Promise.all([buildTenantPublicInfo(db, t.id), getLiveKhutbah(app.ctx, t.id, id)]);
    if (!tenant || !khutbah) throw notFound('Khutbah');
    return { tenant, khutbah };
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
