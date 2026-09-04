import type { FastifyInstance } from 'fastify';
import { SECTION_TYPES, copyKhutbahSchema, createKhutbahSchema, paginationSchema, replaceSectionTextSchema, updateKhutbahSchema, type SectionType } from '@jumaah/shared';
import { z } from 'zod';
import { audit, outbox } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { khutbahDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ALL_STAFF, EDITOR_ROLES } from '../plugins/auth.js';
import { extractDocument } from '../services/import.service.js';
import { FULL_INCLUDE, copyKhutbah, createKhutbah, getKhutbahOrThrow, replaceSectionText, restoreVersion } from '../services/khutbah.service.js';
import { getLiveKhutbah, notifyKhutbahChanged } from '../services/session.service.js';
import { actorOf } from './auth.js';

const listQuery = paginationSchema.extend({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function khutbahRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const editor = app.requireRole(...EDITOR_ROLES);
  const staff = app.requireRole(...ALL_STAFF);

  app.get('/khutbahs', { preHandler: staff }, async (request) => {
    const q = parse(listQuery, request.query);
    const where = {
      tenantId: request.tenantId,
      deletedAt: null,
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.q ? { title: { contains: q.q, mode: 'insensitive' as const } } : {}),
      ...(q.from || q.to ? { gregorianDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const [items, total] = await Promise.all([
      db.khutbah.findMany({ where, include: FULL_INCLUDE, orderBy: { gregorianDate: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      db.khutbah.count({ where }),
    ]);
    return { items: items.map((k) => khutbahDto(k, false)), total, page: q.page, pageSize: q.pageSize };
  });

  app.post('/khutbahs', { preHandler: editor }, async (request, reply) => {
    const body = parse(createKhutbahSchema, request.body);
    const k = await createKhutbah(app.ctx, request.tenantId, body, actorOf(request));
    return reply.code(201).send(khutbahDto(k, true));
  });

  app.get('/khutbahs/:id', { preHandler: staff }, async (request) => {
    const k = await getKhutbahOrThrow(db, request.tenantId, idParam(request.params));
    return khutbahDto(k, true);
  });

  app.get('/khutbahs/:id/live', { preHandler: staff }, async (request) => {
    const k = await getLiveKhutbah(app.ctx, request.tenantId, idParam(request.params));
    if (!k) throw notFound('Khutbah');
    return k;
  });

  app.patch('/khutbahs/:id', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    const body = parse(updateKhutbahSchema, request.body);
    const before = await getKhutbahOrThrow(db, request.tenantId, id);
    const k = await db.khutbah.update({
      where: { id },
      data: {
        title: body.title,
        gregorianDate: body.gregorianDate ? new Date(body.gregorianDate) : undefined,
        hijriDate: body.hijriDate,
        imamName: body.imamName,
        targetLanguages: body.targetLanguages,
        status: body.status,
        notes: body.notes,
      },
      include: FULL_INCLUDE,
    });
    await outbox(db, request.tenantId, 'Khutbah', id, 'UPSERT', { ...k, sections: undefined });
    await audit(db, request.tenantId, actorOf(request), 'khutbah.update', 'Khutbah', id, { title: before.title, status: before.status, targetLanguages: before.targetLanguages }, { title: k.title, status: k.status, targetLanguages: k.targetLanguages });
    await notifyKhutbahChanged(app.ctx, request.tenantId, id);
    return khutbahDto(k, true);
  });

  app.delete('/khutbahs/:id', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    const k = await getKhutbahOrThrow(db, request.tenantId, id);
    await db.khutbah.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await outbox(db, request.tenantId, 'Khutbah', id, 'DELETE', { id });
    await audit(db, request.tenantId, actorOf(request), 'khutbah.delete', 'Khutbah', id, { title: k.title }, null);
    return { ok: true };
  });

  app.post('/khutbahs/:id/copy', { preHandler: editor }, async (request, reply) => {
    const body = parse(copyKhutbahSchema, request.body);
    const k = await copyKhutbah(app.ctx, request.tenantId, idParam(request.params), body, actorOf(request));
    return reply.code(201).send(khutbahDto(k, true));
  });

  app.put('/khutbahs/:id/sections/:type', { preHandler: editor }, async (request) => {
    const type = idParam(request.params, 'type').toUpperCase() as SectionType;
    if (!SECTION_TYPES.includes(type)) throw badRequest('Invalid section type');
    const body = parse(replaceSectionTextSchema, request.body);
    const k = await replaceSectionText(app.ctx, request.tenantId, idParam(request.params), type, body.rawText, actorOf(request), body.changeNote);
    return khutbahDto(k, true);
  });

  app.get('/khutbahs/:id/versions', { preHandler: staff }, async (request) => {
    const id = idParam(request.params);
    await getKhutbahOrThrow(db, request.tenantId, id);
    const rows = await db.khutbahVersion.findMany({ where: { khutbahId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, changeNote: true, createdById: true, createdAt: true } });
    return rows.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));
  });

  app.get('/khutbahs/:id/versions/:version', { preHandler: staff }, async (request) => {
    const id = idParam(request.params);
    const version = Number(idParam(request.params, 'version'));
    const v = await db.khutbahVersion.findFirst({ where: { khutbahId: id, tenantId: request.tenantId, version } });
    if (!v) throw notFound('Version');
    return { id: v.id, version: v.version, changeNote: v.changeNote, createdAt: v.createdAt.toISOString(), snapshot: v.snapshot };
  });

  app.post('/khutbahs/:id/versions/:version/restore', { preHandler: editor }, async (request) => {
    const k = await restoreVersion(app.ctx, request.tenantId, idParam(request.params), Number(idParam(request.params, 'version')), actorOf(request));
    return khutbahDto(k, true);
  });

  /** Upload DOCX/TXT/PDF → extracted text + paragraph preview. Pass ?section=FIRST to apply directly. */
  app.post('/khutbahs/:id/import', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    await getKhutbahOrThrow(db, request.tenantId, id);
    const file = await request.file();
    if (!file) throw badRequest('No file uploaded');
    const buffer = await file.toBuffer();
    const doc = await extractDocument(buffer, file.filename, file.mimetype);
    const section = (request.query as { section?: string })?.section?.toUpperCase() as SectionType | undefined;
    if (section && SECTION_TYPES.includes(section)) {
      const k = await replaceSectionText(app.ctx, request.tenantId, id, section, doc.text, actorOf(request), `Imported ${file.filename}`);
      return { applied: section, format: doc.format, paragraphs: doc.paragraphs.length, khutbah: khutbahDto(k, true) };
    }
    return { format: doc.format, text: doc.text, paragraphs: doc.paragraphs };
  });

  /** Standalone import (no khutbah yet): returns text + paragraphs for the editor. */
  app.post('/import/extract', { preHandler: editor }, async (request) => {
    const file = await request.file();
    if (!file) throw badRequest('No file uploaded');
    const doc = await extractDocument(await file.toBuffer(), file.filename, file.mimetype);
    return { format: doc.format, text: doc.text, paragraphs: doc.paragraphs };
  });

  app.get('/khutbahs/:id/export', { preHandler: staff }, async (request, reply) => {
    const k = await getKhutbahOrThrow(db, request.tenantId, idParam(request.params));
    reply.header('content-disposition', `attachment; filename="khutbah-${k.id}.json"`);
    return khutbahDto(k, true);
  });
}
