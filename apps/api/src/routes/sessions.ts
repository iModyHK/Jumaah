import type { FastifyInstance } from 'fastify';
import { sessionCommandSchema, startSessionSchema } from '@jumaah/shared';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { parse } from '../lib/validate.js';
import { ALL_STAFF } from '../plugins/auth.js';
import { displayCount } from '../realtime/socket.js';
import { applyCommand, getLiveKhutbah, getSnapshot, startSession } from '../services/session.service.js';
import { actorOf } from './auth.js';

const IMAM_ROLES = ['SUPER_ADMIN', 'MOSQUE_ADMIN', 'IMAM'] as const;

/** HTTP fallback for the imam UI (the primary path is Socket.IO). */
export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get('/session', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const snap = await getSnapshot(app.ctx, request.tenantId);
    const khutbah = snap.khutbahId ? await getLiveKhutbah(app.ctx, request.tenantId, snap.khutbahId) : null;
    return { session: snap, khutbah, displays: displayCount(request.tenantId) };
  });

  app.post('/session/start', { preHandler: app.requireRole(...IMAM_ROLES) }, async (request) => {
    const body = parse(startSessionSchema.extend({ deviceId: z.string().max(100).default('http') }), request.body);
    const snap = await startSession(app.ctx, request.tenantId, { khutbahId: body.khutbahId, force: body.force, autoAdvance: body.autoAdvance, userId: request.user!.id, deviceId: body.deviceId });
    await audit(db, request.tenantId, actorOf(request), 'session.start', 'LiveSession', snap.sessionId, null, { khutbahId: body.khutbahId });
    return snap;
  });

  app.post('/session/command', { preHandler: app.requireRole(...IMAM_ROLES) }, async (request) => {
    const body = parse(z.object({ command: sessionCommandSchema, deviceId: z.string().max(100).optional() }), request.body);
    return applyCommand(app.ctx, request.tenantId, body.command, body.deviceId);
  });

  app.post('/session/end', { preHandler: app.requireRole(...IMAM_ROLES) }, async (request) => {
    const snap = await applyCommand(app.ctx, request.tenantId, { type: 'end' });
    await audit(db, request.tenantId, actorOf(request), 'session.end', 'LiveSession', snap.sessionId);
    return snap;
  });

  app.get('/session/history', { preHandler: app.requireRole(...ALL_STAFF) }, async (request) => {
    const rows = await db.liveSession.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'desc' }, take: 50, include: { khutbah: { select: { title: true } } } });
    return rows.map((r) => ({ id: r.id, khutbahId: r.khutbahId, title: r.khutbah.title, state: r.state, startedAt: r.startedAt?.toISOString() ?? null, endedAt: r.endedAt?.toISOString() ?? null, imamDeviceId: r.imamDeviceId }));
  });
}
