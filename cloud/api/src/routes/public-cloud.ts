import type { FastifyInstance } from 'fastify';
import type { ArchiveKhutbahDto, ArchiveListDto } from '@jumaah/cloud-shared';
import { buildTenantPublicInfo, getLiveKhutbah, idParam, notFound } from '@jumaah/api';
import { cloudCtx } from '../context.js';
import { tenantByCustomDomain } from '../services/domain.service.js';
import { archiveEnabled } from '../services/features.js';
import { coreCtx } from '../context.js';

/** Khutbahs that may appear in the public archive: delivered ones and those filed away afterwards. */
const ARCHIVE_STATUSES = ['DELIVERED', 'ARCHIVED'] as const;

/** Public endpoints of the hosted edition: the on-demand TLS check and the public archive. */
export async function publicCloudRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { db } = ctx;

  /**
   * Caddy's on-demand TLS "ask" endpoint: 200 when a mosque has verified this custom domain, 404 otherwise, so a
   * certificate is only ever requested for domains their owners pointed at us.
   */
  app.get('/public/domain-check', async (request, reply) => {
    const domain = (request.query as { domain?: string }).domain?.trim().toLowerCase();
    const t = domain ? await tenantByCustomDomain(ctx, domain) : null;
    if (!t) return reply.code(404).send({ ok: false });
    return { ok: true, slug: t.slug };
  });

  /** The mosque behind an archive address, or 404 when it has no open archive (plan or setting). Never leaks which. */
  const archiveTenant = async (slug: string) => {
    const t = await db.tenant.findUnique({ where: { slug } });
    if (!t || !t.isActive || !archiveEnabled((t.settings as Record<string, unknown>) ?? {}, t)) throw notFound('Archive');
    return t;
  };

  /** Public archive: past khutbahs of a mosque, newest first. */
  app.get('/public/archive/:slug', async (request): Promise<ArchiveListDto> => {
    const t = await archiveTenant(idParam(request.params, 'slug'));
    const [tenant, rows] = await Promise.all([
      buildTenantPublicInfo(app.ctx, t.id),
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
    const [tenant, khutbah] = await Promise.all([buildTenantPublicInfo(app.ctx, t.id), getLiveKhutbah(app.ctx, t.id, id)]);
    if (!tenant || !khutbah) throw notFound('Khutbah');
    return { tenant, khutbah };
  });
}
