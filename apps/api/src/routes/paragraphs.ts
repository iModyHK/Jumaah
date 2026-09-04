import type { FastifyInstance } from 'fastify';
import { mergeParagraphSchema, paragraphInputSchema, reorderParagraphsSchema, splitParagraphSchema, updateParagraphSchema } from '@jumaah/shared';
import { khutbahDto, paragraphDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { EDITOR_ROLES } from '../plugins/auth.js';
import { addParagraph, deleteParagraph, mergeParagraph, reorderParagraphs, splitParagraph, updateParagraph } from '../services/khutbah.service.js';
import { actorOf } from './auth.js';

export async function paragraphRoutes(app: FastifyInstance): Promise<void> {
  const editor = app.requireRole(...EDITOR_ROLES);

  app.patch('/paragraphs/:id', { preHandler: editor }, async (request) => {
    const body = parse(updateParagraphSchema, request.body);
    const row = await updateParagraph(app.ctx, request.tenantId, idParam(request.params), body, actorOf(request));
    const full = await app.ctx.db.paragraph.findUniqueOrThrow({ where: { id: row.id }, include: { translations: true } });
    return paragraphDto(full);
  });

  app.post('/paragraphs/:id/split', { preHandler: editor }, async (request) => {
    const body = parse(splitParagraphSchema, request.body);
    const k = await splitParagraph(app.ctx, request.tenantId, idParam(request.params), body.offset, actorOf(request));
    return khutbahDto(k, true);
  });

  app.post('/paragraphs/:id/merge', { preHandler: editor }, async (request) => {
    const body = parse(mergeParagraphSchema, request.body);
    const k = await mergeParagraph(app.ctx, request.tenantId, idParam(request.params), body.withNextId, actorOf(request));
    return khutbahDto(k, true);
  });

  app.delete('/paragraphs/:id', { preHandler: editor }, async (request) => {
    await deleteParagraph(app.ctx, request.tenantId, idParam(request.params), actorOf(request));
    return { ok: true };
  });

  app.post('/sections/:id/paragraphs', { preHandler: editor }, async (request, reply) => {
    const body = parse(paragraphInputSchema.extend({ afterId: paragraphInputSchema.shape.reference.unwrap().unwrap().optional() }), request.body);
    const row = await addParagraph(app.ctx, request.tenantId, idParam(request.params), body, actorOf(request));
    return reply.code(201).send(paragraphDto({ ...row, translations: [] }));
  });

  app.put('/sections/:id/reorder', { preHandler: editor }, async (request) => {
    const body = parse(reorderParagraphsSchema, request.body);
    const k = await reorderParagraphs(app.ctx, request.tenantId, idParam(request.params), body.orderedIds, actorOf(request));
    return khutbahDto(k, true);
  });
}
