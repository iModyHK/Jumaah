import type { FastifyInstance } from 'fastify';
import { paginationSchema, shareToLibrarySchema, toHijri, type LibraryKhutbahDto } from '@jumaah/shared';
import { z } from 'zod';
import { audit, outbox } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/errors.js';
import { khutbahDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ALL_STAFF, EDITOR_ROLES } from '../plugins/auth.js';
import { createParagraphRows, getKhutbahOrThrow, snapshotVersion } from '../services/khutbah.service.js';
import { actorOf } from './auth.js';

interface LibrarySnapshot {
  title: string;
  targetLanguages: string[];
  sections: Array<{ type: 'FIRST' | 'SECOND' | 'DUA'; paragraphs: Array<{ textAr: string; kind: 'TEXT' | 'QURAN' | 'HADITH'; reference: string | null; estimatedSeconds: number; translations: Array<{ lang: string; text: string }> }> }>;
}

/** Shared khutbah library: mosques share, super admin approves, any mosque imports. */
export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  const dto = (r: { id: string; title: string; description: string | null; tags: string[]; languages: string[]; paragraphCount: number; approved: boolean; createdAt: Date; sourceTenant: { name: string } }): LibraryKhutbahDto => ({
    id: r.id,
    title: r.title,
    description: r.description,
    tags: r.tags,
    sourceTenantName: r.sourceTenant.name,
    languages: r.languages,
    paragraphCount: r.paragraphCount,
    approved: r.approved,
    createdAt: r.createdAt.toISOString(),
  });

  app.get('/library', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const q = parse(paginationSchema.extend({ pending: z.string().optional() }), request.query);
    const isSuper = request.user!.role === 'SUPER_ADMIN';
    // Visibility and search are separate OR groups; they must be combined with AND, otherwise a search term
    // replaced the visibility filter and let a mosque list other mosques' unapproved submissions.
    const visibility = isSuper && q.pending === '1' ? { approved: false } : isSuper ? {} : { OR: [{ approved: true }, { sourceTenantId: request.tenantId }] };
    const search = q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { tags: { has: q.q } }] } : {};
    const where = { AND: [visibility, search] };
    const [items, total] = await Promise.all([
      db.libraryKhutbah.findMany({ where, include: { sourceTenant: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.libraryKhutbah.count({ where }),
    ]);
    return { items: items.map(dto), total, page: q.page, pageSize: q.pageSize };
  });

  app.get('/library/:id', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const r = await db.libraryKhutbah.findUnique({ where: { id: idParam(request.params) }, include: { sourceTenant: { select: { name: true } } } });
    if (!r || (!r.approved && r.sourceTenantId !== request.tenantId && request.user!.role !== 'SUPER_ADMIN')) throw notFound('Library item');
    return { ...dto(r), snapshot: r.snapshot };
  });

  app.post('/library/share', { preHandler: app.requireRole(...EDITOR_ROLES) }, async (request, reply) => {
    const body = parse(shareToLibrarySchema, request.body);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: request.tenantId } });
    if (!tenant.librarySharingAllowed && request.user!.role !== 'SUPER_ADMIN') throw forbidden('Library sharing is not enabled for this mosque');
    const k = await getKhutbahOrThrow(db, request.tenantId, body.khutbahId);
    const snapshot: LibrarySnapshot = {
      title: k.title,
      targetLanguages: k.targetLanguages,
      sections: k.sections.map((s) => ({
        type: s.type,
        paragraphs: s.paragraphs.map((p) => ({
          textAr: p.textAr,
          kind: p.kind,
          reference: p.reference,
          estimatedSeconds: p.estimatedSeconds,
          translations: p.translations.filter((t) => t.status === 'APPROVED').map((t) => ({ lang: t.lang, text: t.text })),
        })),
      })),
    };
    const row = await db.libraryKhutbah.create({
      data: {
        sourceTenantId: request.tenantId,
        sourceKhutbahId: k.id,
        title: k.title,
        description: body.description ?? null,
        tags: body.tags,
        languages: k.targetLanguages,
        paragraphCount: snapshot.sections.reduce((n, s) => n + s.paragraphs.length, 0),
        snapshot: snapshot as never,
        approved: request.user!.role === 'SUPER_ADMIN',
        approvedAt: request.user!.role === 'SUPER_ADMIN' ? new Date() : null,
        approvedById: request.user!.role === 'SUPER_ADMIN' ? request.user!.id : null,
      },
      include: { sourceTenant: { select: { name: true } } },
    });
    await db.khutbah.update({ where: { id: k.id }, data: { libraryId: row.id } });
    await audit(db, request.tenantId, actorOf(request), 'library.share', 'LibraryKhutbah', row.id, null, { khutbahId: k.id });
    return reply.code(201).send(dto(row));
  });

  app.post('/library/:id/approve', { preHandler: app.requireRole('SUPER_ADMIN') }, async (request) => {
    const id = idParam(request.params);
    const approved = (request.body as { approved?: boolean })?.approved ?? true;
    const row = await db.libraryKhutbah.update({ where: { id }, data: { approved, approvedAt: approved ? new Date() : null, approvedById: approved ? request.user!.id : null }, include: { sourceTenant: { select: { name: true } } } });
    await audit(db, null, actorOf(request), approved ? 'library.approve' : 'library.reject', 'LibraryKhutbah', id);
    return dto(row);
  });

  app.delete('/library/:id', { preHandler: app.requireRole(...EDITOR_ROLES) }, async (request) => {
    const id = idParam(request.params);
    const r = await db.libraryKhutbah.findUnique({ where: { id } });
    if (!r) throw notFound('Library item');
    if (r.sourceTenantId !== request.tenantId && request.user!.role !== 'SUPER_ADMIN') throw forbidden();
    await db.libraryKhutbah.delete({ where: { id } });
    await audit(db, request.tenantId, actorOf(request), 'library.delete', 'LibraryKhutbah', id);
    return { ok: true };
  });

  /** Import a library khutbah into the current mosque as a new DRAFT (approved translations become REVIEWED). */
  app.post('/library/:id/import', { preHandler: app.requireRole(...EDITOR_ROLES) }, async (request, reply) => {
    const id = idParam(request.params);
    const body = parse(z.object({ gregorianDate: z.string().optional(), title: z.string().max(300).optional() }), request.body);
    const r = await db.libraryKhutbah.findUnique({ where: { id } });
    if (!r || (!r.approved && r.sourceTenantId !== request.tenantId && request.user!.role !== 'SUPER_ADMIN')) throw notFound('Library item');
    const snap = r.snapshot as unknown as LibrarySnapshot;
    const tenantId = request.tenantId;
    const date = body.gregorianDate ? new Date(body.gregorianDate) : new Date();
    const tl = await db.tenantLanguage.findMany({ where: { tenantId, enabled: true } });
    const k = await db.$transaction(async (tx) => {
      const created = await tx.khutbah.create({
        data: { tenantId, title: body.title ?? snap.title, gregorianDate: date, hijriDate: toHijri(date).formatted, targetLanguages: tl.map((l) => l.code), libraryId: r.id, createdById: request.user!.id },
      });
      await outbox(tx, tenantId, 'Khutbah', created.id, 'UPSERT', created);
      const types = ['FIRST', 'SECOND', 'DUA'] as const;
      for (let i = 0; i < types.length; i++) {
        const s = await tx.khutbahSection.create({ data: { khutbahId: created.id, tenantId, type: types[i], order: i } });
        await outbox(tx, tenantId, 'KhutbahSection', s.id, 'UPSERT', s);
        const from = snap.sections.find((x) => x.type === types[i]);
        if (!from) continue;
        const rows = await createParagraphRows(tx, tenantId, s.id, from.paragraphs.map((p) => ({ text: p.textAr, kind: p.kind, reference: p.reference, estimatedSeconds: p.estimatedSeconds })));
        for (let j = 0; j < rows.length; j++) {
          for (const t of from.paragraphs[j].translations) {
            const nt = await tx.translation.create({ data: { paragraphId: rows[j].id, tenantId, lang: t.lang, text: t.text, status: 'REVIEWED', providerType: 'MANUAL' } });
            await outbox(tx, tenantId, 'Translation', nt.id, 'UPSERT', nt);
          }
        }
      }
      await snapshotVersion(tx, tenantId, created.id, `Imported from library: ${snap.title}`, request.user!.id);
      return created;
    });
    await audit(db, tenantId, actorOf(request), 'library.import', 'Khutbah', k.id, null, { libraryId: r.id });
    return reply.code(201).send(khutbahDto(await getKhutbahOrThrow(db, tenantId, k.id), true));
  });
}
