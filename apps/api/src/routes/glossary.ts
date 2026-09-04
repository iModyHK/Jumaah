import type { FastifyInstance } from 'fastify';
import { glossaryEntrySchema } from '@jumaah/shared';
import { z } from 'zod';
import { audit, outbox } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';
import { glossaryDto } from '../lib/serialize.js';
import { idParam, parse } from '../lib/validate.js';
import { ALL_STAFF, EDITOR_ROLES } from '../plugins/auth.js';
import { actorOf } from './auth.js';

export async function glossaryRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const editor = app.requireRole(...EDITOR_ROLES);

  app.get('/glossary', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const rows = await db.glossaryEntry.findMany({ where: { tenantId: request.tenantId }, orderBy: [{ term: 'asc' }, { lang: 'asc' }] });
    return rows.map(glossaryDto);
  });

  app.post('/glossary', { preHandler: editor }, async (request, reply) => {
    const body = parse(glossaryEntrySchema, request.body);
    const exists = await db.glossaryEntry.findUnique({ where: { tenantId_term_lang: { tenantId: request.tenantId, term: body.term, lang: body.lang } } });
    if (exists) throw conflict('Term already exists for this language');
    const row = await db.glossaryEntry.create({ data: { tenantId: request.tenantId, ...body } });
    await outbox(db, request.tenantId, 'GlossaryEntry', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'glossary.create', 'GlossaryEntry', row.id, null, body);
    return reply.code(201).send(glossaryDto(row));
  });

  app.post('/glossary/bulk', { preHandler: editor }, async (request) => {
    const body = parse(z.object({ entries: z.array(glossaryEntrySchema).max(1000) }), request.body);
    let written = 0;
    await db.$transaction(async (tx) => {
      for (const e of body.entries) {
        const row = await tx.glossaryEntry.upsert({
          where: { tenantId_term_lang: { tenantId: request.tenantId, term: e.term, lang: e.lang } },
          update: { replacement: e.replacement, mode: e.mode, note: e.note },
          create: { tenantId: request.tenantId, ...e },
        });
        await outbox(tx, request.tenantId, 'GlossaryEntry', row.id, 'UPSERT', row);
        written += 1;
      }
    });
    await audit(db, request.tenantId, actorOf(request), 'glossary.bulk', 'GlossaryEntry', null, null, { written });
    return { written };
  });

  app.patch('/glossary/:id', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    const body = parse(glossaryEntrySchema.partial(), request.body);
    const before = await db.glossaryEntry.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!before) throw notFound('Glossary entry');
    const row = await db.glossaryEntry.update({ where: { id }, data: body });
    await outbox(db, request.tenantId, 'GlossaryEntry', row.id, 'UPSERT', row);
    await audit(db, request.tenantId, actorOf(request), 'glossary.update', 'GlossaryEntry', id, glossaryDto(before), glossaryDto(row));
    return glossaryDto(row);
  });

  app.delete('/glossary/:id', { preHandler: editor }, async (request) => {
    const id = idParam(request.params);
    const before = await db.glossaryEntry.findFirst({ where: { id, tenantId: request.tenantId } });
    if (!before) throw notFound('Glossary entry');
    await db.glossaryEntry.delete({ where: { id } });
    await outbox(db, request.tenantId, 'GlossaryEntry', id, 'DELETE', { id });
    await audit(db, request.tenantId, actorOf(request), 'glossary.delete', 'GlossaryEntry', id, glossaryDto(before), null);
    return { ok: true };
  });
}
