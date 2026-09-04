import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { ROOMS, sessionCommandSchema, type DisplayConfig, type SessionCommand } from '@jumaah/shared';
import type { Redis } from 'ioredis';
import type { AppContext, IO } from '../lib/context.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { buildTenantPublicInfo } from '../lib/live-payload.js';
import { applyCommand, getLiveKhutbah, getSnapshot, heartbeat } from '../services/session.service.js';

export function displayConfigOf(d: {
  id: string;
  name: string;
  languages: string[];
  layout: string;
  fontScale: number;
  theme: string;
  showPrevious: boolean;
  showArabic: boolean;
  showQr: boolean;
  logoUrl: string | null;
  token: string;
}, publicBaseUrl: string, tenantSlug: string): DisplayConfig {
  return {
    id: d.id,
    name: d.name,
    languages: d.languages,
    layout: d.layout as DisplayConfig['layout'],
    fontScale: d.fontScale,
    theme: d.theme,
    showPrevious: d.showPrevious,
    showArabic: d.showArabic,
    showQr: d.showQr,
    logoUrl: d.logoUrl,
    publicUrl: `${publicBaseUrl}/display/m/${tenantSlug}`,
  };
}

export function createSocketServer(
  httpServer: HttpServer,
  deps: { redisUrl: string; corsOrigins: string[]; pub: Redis; sub: Redis },
): IO {
  const io: IO = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: deps.corsOrigins.length ? deps.corsOrigins : true, credentials: true },
    pingInterval: 5000,
    pingTimeout: 10000,
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 1e6,
  });
  io.adapter(createAdapter(deps.pub, deps.sub));
  return io;
}

const displayCounts = new Map<string, number>();
const lastSeenWrite = new Map<string, number>();

export function attachSocketHandlers(ctx: AppContext): void {
  const { io, db, config, log } = ctx;

  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: string; displayToken?: string; slug?: string; deviceId?: string };
      if (auth.displayToken) {
        const display = await db.display.findUnique({ where: { token: auth.displayToken }, include: { tenant: true } });
        if (!display || !display.tenant.isActive) return next(new Error('INVALID_DISPLAY_TOKEN'));
        socket.data = { tenantId: display.tenantId, role: 'DISPLAY', displayId: display.id, deviceId: auth.deviceId };
        return next();
      }
      if (auth.token) {
        const claims = await verifyAccessToken(config.JWT_SECRET, auth.token);
        const tenantId = claims.tid ?? (socket.handshake.query.tenantId as string | undefined) ?? null;
        if (!tenantId) return next(new Error('NO_TENANT'));
        socket.data = {
          tenantId,
          role: claims.role === 'IMAM' ? 'IMAM' : 'ADMIN',
          userId: claims.sub,
          deviceId: auth.deviceId,
          // Only the imam and mosque/platform admins may drive the live session; translators get admin-room updates only.
          canCommand: claims.role === 'IMAM' || claims.role === 'MOSQUE_ADMIN' || claims.role === 'SUPER_ADMIN',
        };
        return next();
      }
      if (auth.slug) {
        const tenant = await db.tenant.findUnique({ where: { slug: auth.slug } });
        const enabled = (tenant?.settings as { publicDisplayEnabled?: boolean })?.publicDisplayEnabled !== false;
        if (!tenant || !tenant.isActive || !enabled) return next(new Error('INVALID_TENANT'));
        socket.data = { tenantId: tenant.id, role: 'PUBLIC', deviceId: auth.deviceId };
        return next();
      }
      return next(new Error('UNAUTHORIZED'));
    } catch (err) {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', async (socket) => {
    const { tenantId, role } = socket.data;
    socket.join(ROOMS.tenant(tenantId));
    if (role === 'DISPLAY' || role === 'PUBLIC') socket.join(ROOMS.displays(tenantId));
    if (role === 'IMAM') socket.join(ROOMS.imam(tenantId));
    if (role === 'ADMIN') socket.join(ROOMS.admin(tenantId));

    const sendState = async () => {
      const snap = await getSnapshot(ctx, tenantId);
      socket.emit('session:state', snap);
      if (snap.khutbahId) {
        const k = await getLiveKhutbah(ctx, tenantId, snap.khutbahId);
        if (k) socket.emit('session:khutbah', k);
      }
      socket.emit('server:time', Date.now());
    };

    const bumpDisplays = (delta: number) => {
      const n = Math.max(0, (displayCounts.get(tenantId) ?? 0) + delta);
      displayCounts.set(tenantId, n);
      io.to(ROOMS.imam(tenantId)).to(ROOMS.admin(tenantId)).emit('displays:count', { count: n });
    };

    if (role === 'DISPLAY' || role === 'PUBLIC') {
      bumpDisplays(1);
      const info = await buildTenantPublicInfo(db, tenantId);
      if (info) socket.emit('tenant:info', info);
      if (role === 'DISPLAY' && socket.data.displayId) {
        const d = await db.display.findUnique({ where: { id: socket.data.displayId }, include: { tenant: { select: { slug: true } } } });
        if (d) socket.emit('display:config', displayConfigOf(d, config.PUBLIC_BASE_URL, d.tenant.slug));
        touchDisplay(ctx, socket.data.displayId);
      }
      await sendState();
    }

    if (role === 'IMAM' || role === 'ADMIN') {
      await sendState();
      socket.emit('displays:count', { count: displayCounts.get(tenantId) ?? 0 });
      if (role === 'IMAM' && socket.data.deviceId) void heartbeat(ctx, tenantId, socket.data.deviceId, true);
    }

    // Every handler below must tolerate a missing/invalid payload or callback: an exception thrown inside a
    // socket.io listener (or an unhandled rejection from an async one) takes the whole API process down,
    // and the public phone page connects without any authentication.
    const reply = (ack: unknown, value: unknown) => {
      if (typeof ack === 'function') ack(value);
    };
    const deviceIdOf = (payload: unknown): string | undefined => {
      const d = (payload as { deviceId?: unknown } | null | undefined)?.deviceId;
      return typeof d === 'string' && d.length > 0 && d.length <= 200 ? d : undefined;
    };

    socket.on('display:hello', async (_payload, ack) => {
      try {
        if (socket.data.displayId) touchDisplay(ctx, socket.data.displayId);
        await sendState();
        reply(ack, true);
      } catch (err) {
        log.warn({ err }, 'display:hello failed');
        reply(ack, false);
      }
    });

    socket.on('imam:hello', async (payload, ack) => {
      try {
        if (role !== 'IMAM' && role !== 'ADMIN') return reply(ack, null);
        const deviceId = deviceIdOf(payload);
        if (deviceId) socket.data.deviceId = deviceId;
        const snap = await getSnapshot(ctx, tenantId);
        if (snap.khutbahId) {
          const k = await getLiveKhutbah(ctx, tenantId, snap.khutbahId);
          if (k) socket.emit('session:khutbah', k);
        }
        if (deviceId) void heartbeat(ctx, tenantId, deviceId, true);
        reply(ack, snap);
      } catch (err) {
        log.warn({ err }, 'imam:hello failed');
        reply(ack, null);
      }
    });

    socket.on('imam:command', async (payload, ack) => {
      try {
        if ((role !== 'IMAM' && role !== 'ADMIN') || !socket.data.canCommand) return reply(ack, { ok: false, error: 'FORBIDDEN' });
        const body = (payload ?? {}) as { command?: unknown; commandId?: unknown };
        const parsed = sessionCommandSchema.safeParse(body.command);
        if (!parsed.success) return reply(ack, { ok: false, error: 'INVALID_COMMAND' });
        const snap = await applyCommand(ctx, tenantId, parsed.data as SessionCommand, socket.data.deviceId);
        socket.emit('imam:ack', { seq: snap.seq, commandId: typeof body.commandId === 'string' ? body.commandId : '' });
        reply(ack, { ok: true, seq: snap.seq });
      } catch (err) {
        reply(ack, { ok: false, error: (err as Error).message });
      }
    });

    socket.on('imam:heartbeat', (payload) => {
      const deviceId = deviceIdOf(payload);
      if ((role === 'IMAM' || role === 'ADMIN') && deviceId) void heartbeat(ctx, tenantId, deviceId, true);
    });

    socket.on('ping:time', (_clientTs, ack) => reply(ack, Date.now()));

    socket.on('disconnect', async () => {
      if (role === 'DISPLAY' || role === 'PUBLIC') bumpDisplays(-1);
      if (role === 'IMAM' && socket.data.deviceId) {
        // If no other imam socket for this device/tenant remains, mark disconnected (displays keep last paragraph).
        const remaining = await io.in(ROOMS.imam(tenantId)).fetchSockets();
        const stillThere = remaining.some((s) => s.data.deviceId === socket.data.deviceId);
        if (!stillThere) void heartbeat(ctx, tenantId, socket.data.deviceId, false);
      }
    });
  });

  log.info('socket.io handlers attached');
}

function touchDisplay(ctx: AppContext, displayId: string) {
  const last = lastSeenWrite.get(displayId) ?? 0;
  if (Date.now() - last < 30_000) return;
  lastSeenWrite.set(displayId, Date.now());
  void ctx.db.display.update({ where: { id: displayId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
}

export function displayCount(tenantId: string): number {
  return displayCounts.get(tenantId) ?? 0;
}
