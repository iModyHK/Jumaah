import type { FastifyInstance } from 'fastify';
import { bulkTranslateSchema, importTranslationsSchema, reviewTranslationSchema, upsertTranslationSchema, type TranslationStatus } from '@jumaah/shared';
import { z } from 'zod';
import { audit, outbox } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { jobDto, translationDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ALL_STAFF, EDITOR_ROLES } from '../plugins/auth.js';
import { getKhutbahOrThrow } from '../services/khutbah.service.js';
import { notifyKhutbahChanged } from '../services/session.service.js';
import { cancelJob, estimateCost, startJob } from '../services/translation.service.js';
import { actorOf } from './auth.js';

export async function translationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const editor = app.requireRole(...EDITOR_ROLES);
  const staff = app.requireRole(...ALL_STAFF);

  async function khutbahIdOfParagraph(paragraphId: string, tenantId: string) {
    const p = await db.paragraph.findFirst({ where: { id: paragraphId, tenantId }, include: { section: true } });
    if (!p) throw notFound('Paragraph');
    return p.section.khutbahId;
  }

  /** Manual entry / edit of a translation (Quran/Hadith blocks, corrections). */
  app.put('/paragraphs/:id/translations', { preHandler: editor }, async (request) => {
    const paragraphId = idParam(request.params);
    const body = parse(upsertTranslationSchema, request.body);
    const tenantId = request.tenantId;
    const khutbahId = await khutbahIdOfParagraph(paragraphId, tenantId);
    const status: TranslationStatus = body.status ?? 'REVIEWED';
    const existing = await db.translation.findUnique({ where: { paragraphId_lang: { paragraphId, lang: body.lang } } });
    const row = await db.$transaction(async (tx) => {
      const r = existing
        ? await tx.translation.update({
            where: { id: existing.id },
            data: {
              text: body.text,
              status,
              providerType: 'MANUAL',
              version: { increment: 1 },
              reviewedById: status === 'REVIEWED' || status === 'APPROVED' ? request.user!.id : existing.reviewedById,
              approvedById: status === 'APPROVED' ? request.user!.id : null,
            },
          })
        : await tx.translation.create({
            data: { paragraphId, tenantId, lang: body.lang, text: body.text, status, providerType: 'MANUAL', reviewedById: request.user!.id, approvedById: status === 'APPROVED' ? request.user!.id : null },
          });
      await tx.translationVersion.create({ data: { translationId: r.id, tenantId, version: r.version, text: r.text, status: r.status, providerType: 'MANUAL', changedById: request.user!.id } });
      await outbox(tx, tenantId, 'Translation', r.id, 'UPSERT', r, r.version);
      return r;
    });
    await audit(db, tenantId, actorOf(request), 'translation.upsert', 'Translation', row.id, existing ? { text: existing.text, status: existing.status } : null, { text: row.text, status: row.status });
    await notifyKhutbahChanged(app.ctx, tenantId, khutbahId);
    return translationDto(row);
  });

  app.post('/translations/:id/review', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    const body = parse(reviewTranslationSchema, request.body);
    const tenantId = request.tenantId;
    const t = await db.translation.findFirst({ where: { id, tenantId }, include: { paragraph: { include: { section: true } } } });
    if (!t) throw notFound('Translation');
    const status: TranslationStatus = body.action === 'approve' ? 'APPROVED' : body.action === 'reject' ? 'REJECTED' : 'REVIEWED';
    const textChanged = body.text !== undefined && body.text !== t.text;
    const row = await db.$transaction(async (tx) => {
      const r = await tx.translation.update({
        where: { id },
        data: {
          text: body.text ?? t.text,
          status,
          reviewNote: body.note ?? null,
          reviewedById: request.user!.id,
          approvedById: status === 'APPROVED' ? request.user!.id : null,
          version: textChanged ? { increment: 1 } : undefined,
        },
      });
      if (textChanged) await tx.translationVersion.create({ data: { translationId: r.id, tenantId, version: r.version, text: r.text, status, providerType: r.providerType, changedById: request.user!.id } });
      await outbox(tx, tenantId, 'Translation', r.id, 'UPSERT', r, r.version);
      return r;
    });
    await audit(db, tenantId, actorOf(request), `translation.${body.action}`, 'Translation', id, { status: t.status, text: t.text }, { status: row.status, text: row.text });
    await notifyKhutbahChanged(app.ctx, tenantId, t.paragraph.section.khutbahId);
    await maybeMarkReady(t.paragraph.section.khutbahId, tenantId);
    return translationDto(row);
  });

  app.get('/translations/:id/history', { preHandler: staff }, async (request) => {
    const id = idParam(request.params);
    const rows = await db.translationVersion.findMany({ where: { translationId: id, tenantId: request.tenantId }, orderBy: { version: 'desc' } });
    return rows.map((v) => ({ id: v.id, version: v.version, text: v.text, status: v.status, providerType: v.providerType, changedById: v.changedById, createdAt: v.createdAt.toISOString() }));
  });

  /** Approve every REVIEWED/MACHINE translation of a khutbah (optionally one language). */
  app.post('/khutbahs/:id/approve-all', { preHandler: editor }, async (request) => {
    const khutbahId = idParam(request.params);
    const tenantId = request.tenantId;
    const lang = parse(z.object({ lang: z.string().optional() }), request.body).lang;
    const k = await getKhutbahOrThrow(db, tenantId, khutbahId);
    const ids = k.sections.flatMap((s) => s.paragraphs.flatMap((p) => p.translations.filter((t) => (!lang || t.lang === lang) && (t.status === 'MACHINE' || t.status === 'REVIEWED')).map((t) => t.id)));
    await db.$transaction(async (tx) => {
      for (const id of ids) {
        const r = await tx.translation.update({ where: { id }, data: { status: 'APPROVED', approvedById: request.user!.id, reviewedById: request.user!.id } });
        await outbox(tx, tenantId, 'Translation', r.id, 'UPSERT', r, r.version);
      }
    });
    await audit(db, tenantId, actorOf(request), 'translation.approveAll', 'Khutbah', khutbahId, null, { count: ids.length, lang });
    await notifyKhutbahChanged(app.ctx, tenantId, khutbahId);
    await maybeMarkReady(khutbahId, tenantId);
    return { approved: ids.length };
  });

  /** Import translations from a list (one text per paragraph in order) — used by the file upload UI. */
  app.post('/khutbahs/:id/translations/import', { preHandler: editor }, async (request) => {
    const khutbahId = idParam(request.params);
    const tenantId = request.tenantId;
    const body = parse(importTranslationsSchema, request.body);
    const k = await getKhutbahOrThrow(db, tenantId, khutbahId);
    const paragraphs = k.sections.filter((s) => !body.sectionType || s.type === body.sectionType).flatMap((s) => s.paragraphs);
    if (body.texts.length !== paragraphs.length) throw badRequest(`Expected ${paragraphs.length} entries, received ${body.texts.length}`);
    let written = 0;
    await db.$transaction(async (tx) => {
      for (let i = 0; i < paragraphs.length; i++) {
        const text = body.texts[i]?.trim();
        if (!text) continue;
        const p = paragraphs[i];
        const r = await tx.translation.upsert({
          where: { paragraphId_lang: { paragraphId: p.id, lang: body.lang } },
          update: { text, status: body.status, providerType: 'MANUAL', version: { increment: 1 }, reviewedById: request.user!.id, approvedById: body.status === 'APPROVED' ? request.user!.id : null },
          create: { paragraphId: p.id, tenantId, lang: body.lang, text, status: body.status, providerType: 'MANUAL', reviewedById: request.user!.id, approvedById: body.status === 'APPROVED' ? request.user!.id : null },
        });
        await tx.translationVersion.create({ data: { translationId: r.id, tenantId, version: r.version, text, status: body.status, providerType: 'MANUAL', changedById: request.user!.id } });
        await outbox(tx, tenantId, 'Translation', r.id, 'UPSERT', r, r.version);
        written += 1;
      }
    });
    await audit(db, tenantId, actorOf(request), 'translation.import', 'Khutbah', khutbahId, null, { lang: body.lang, written });
    await notifyKhutbahChanged(app.ctx, tenantId, khutbahId);
    return { written };
  });

  // ---- Machine translation jobs ----
  app.post('/khutbahs/:id/translate/estimate', { preHandler: editor }, async (request) => {
    const body = parse(bulkTranslateSchema, request.body);
    return estimateCost(app.ctx, request.tenantId, idParam(request.params), body);
  });

  app.post('/khutbahs/:id/translate', { preHandler: editor }, async (request, reply) => {
    const body = parse(bulkTranslateSchema, request.body);
    const job = await startJob(app.ctx, request.tenantId, idParam(request.params), body, actorOf(request));
    return reply.code(202).send(jobDto(job));
  });

  app.get('/khutbahs/:id/jobs', { preHandler: staff }, async (request) => {
    const rows = await db.translationJob.findMany({ where: { khutbahId: idParam(request.params), tenantId: request.tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(jobDto);
  });

  app.get('/translation-jobs/:id', { preHandler: staff }, async (request) => {
    const job = await db.translationJob.findFirst({ where: { id: idParam(request.params), tenantId: request.tenantId } });
    if (!job) throw notFound('Job');
    return jobDto(job);
  });

  app.post('/translation-jobs/:id/cancel', { preHandler: editor }, async (request) => {
    return jobDto(await cancelJob(app.ctx, request.tenantId, idParam(request.params)));
  });

  async function maybeMarkReady(khutbahId: string, tenantId: string) {
    const k = await getKhutbahOrThrow(db, tenantId, khutbahId);
    if (k.status === 'DELIVERED' || k.status === 'ARCHIVED') return;
    const allApproved = k.sections.every((s) => s.paragraphs.every((p) => k.targetLanguages.every((l) => p.translations.find((t) => t.lang === l)?.status === 'APPROVED')));
    const hasParagraphs = k.sections.some((s) => s.paragraphs.length > 0);
    const next = allApproved && hasParagraphs ? 'READY' : k.status === 'READY' ? 'REVIEW' : k.status;
    if (next !== k.status) await db.khutbah.update({ where: { id: khutbahId }, data: { status: next } });
  }
}
