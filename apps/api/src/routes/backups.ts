import type { FastifyInstance } from 'fastify';
import type { BackupDto } from '@jumaah/shared';
import { badRequest } from '../lib/errors.js';
import { idParam } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { backupStream, createBackup, parseBackup, readBackup, restoreBackup } from '../services/backup.service.js';
import { actorOf } from './auth.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);
  const dto = (b: { id: string; filename: string; sizeBytes: number; createdAt: Date; note: string | null }): BackupDto => ({ id: b.id, filename: b.filename, sizeBytes: b.sizeBytes, createdAt: b.createdAt.toISOString(), note: b.note });

  app.get('/backups', { preHandler: admin }, async (request) => {
    const rows = await db.backup.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(dto);
  });

  app.post('/backups', { preHandler: admin }, async (request, reply) => {
    const note = (request.body as { note?: string })?.note;
    const row = await createBackup(app.ctx, request.tenantId, actorOf(request), note);
    return reply.code(201).send(dto(row));
  });

  app.get('/backups/:id/download', { preHandler: admin }, async (request, reply) => {
    const { row, stream } = await backupStream(app.ctx, request.tenantId, idParam(request.params));
    reply.header('content-type', 'application/gzip');
    reply.header('content-disposition', `attachment; filename="${row.filename}"`);
    return reply.send(stream);
  });

  app.post('/backups/:id/restore', { preHandler: admin }, async (request) => {
    const data = await readBackup(app.ctx, request.tenantId, idParam(request.params));
    await restoreBackup(app.ctx, request.tenantId, data, actorOf(request));
    return { ok: true, restoredFrom: data.createdAt };
  });

  /** Restore from an uploaded backup file (e.g. moving a mosque to a new edge server). */
  app.post('/backups/restore-upload', { preHandler: admin }, async (request) => {
    const file = await request.file();
    if (!file) throw badRequest('No file uploaded');
    const data = parseBackup(await file.toBuffer());
    await restoreBackup(app.ctx, request.tenantId, data, actorOf(request));
    return { ok: true, restoredFrom: data.createdAt };
  });
}
