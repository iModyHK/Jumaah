import type { LiveKhutbah, LiveSessionSnapshot, SectionType, SessionCommand } from '@jumaah/shared';
import { ROOMS, SESSION_STALE_MS } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';
import { buildLiveKhutbah } from '../lib/live-payload.js';
import { conflict, notFound, badRequest } from '../lib/errors.js';

const SESSION_KEY = (t: string) => `session:${t}`;
const KHUTBAH_KEY = (t: string, k: string) => `livekhutbah:${t}:${k}`;
const autoTimers = new Map<string, NodeJS.Timeout>();

function emptySnapshot(tenantId: string): LiveSessionSnapshot {
  return {
    sessionId: null,
    tenantId,
    state: 'WAITING',
    khutbahId: null,
    currentParagraphId: null,
    currentIndex: 0,
    currentSection: null,
    autoAdvance: false,
    startedAt: null,
    sectionStartedAt: null,
    seq: 0,
    updatedAt: new Date().toISOString(),
    imamConnected: false,
  };
}

/** Cached live khutbah payload (invalidated whenever the khutbah changes). */
export async function getLiveKhutbah(ctx: AppContext, tenantId: string, khutbahId: string): Promise<LiveKhutbah | null> {
  const key = KHUTBAH_KEY(tenantId, khutbahId);
  const cached = await ctx.redis.get(key);
  if (cached) return JSON.parse(cached) as LiveKhutbah;
  const built = await buildLiveKhutbah(ctx.db, tenantId, khutbahId);
  if (built) await ctx.redis.set(key, JSON.stringify(built), 'EX', 3600);
  return built;
}

export async function invalidateLiveKhutbah(ctx: AppContext, tenantId: string, khutbahId: string): Promise<void> {
  await ctx.redis.del(KHUTBAH_KEY(tenantId, khutbahId));
}

/** Called after any khutbah/translation mutation: refresh displays if this khutbah is live. */
export async function notifyKhutbahChanged(ctx: AppContext, tenantId: string, khutbahId: string): Promise<void> {
  await invalidateLiveKhutbah(ctx, tenantId, khutbahId);
  const snap = await getSnapshot(ctx, tenantId);
  const k = await getLiveKhutbah(ctx, tenantId, khutbahId);
  if (k) ctx.io.to(ROOMS.admin(tenantId)).emit('khutbah:changed', { khutbahId, version: k.version });
  if (snap.khutbahId === khutbahId && k) ctx.io.to(ROOMS.tenant(tenantId)).emit('session:khutbah', k);
}

export async function getSnapshot(ctx: AppContext, tenantId: string): Promise<LiveSessionSnapshot> {
  const raw = await ctx.redis.get(SESSION_KEY(tenantId));
  if (raw) {
    const cached = JSON.parse(raw) as LiveSessionSnapshot;
    // ENDED is transient (8s); if the API restarted before the reset timer fired, fall back to WAITING.
    if (cached.state === 'ENDED' && Date.now() - new Date(cached.updatedAt).getTime() > 10_000) {
      const snap = emptySnapshot(tenantId);
      await ctx.redis.set(SESSION_KEY(tenantId), JSON.stringify(snap));
      return snap;
    }
    return cached;
  }
  // Recover from DB after a restart.
  const row = await ctx.db.liveSession.findFirst({ where: { tenantId, endedAt: null }, orderBy: { createdAt: 'desc' } });
  const snap = row
    ? {
        sessionId: row.id,
        tenantId,
        state: row.state,
        khutbahId: row.khutbahId,
        currentParagraphId: row.currentParagraphId,
        currentIndex: row.currentIndex,
        currentSection: row.currentSection,
        autoAdvance: row.autoAdvance,
        startedAt: row.startedAt?.toISOString() ?? null,
        sectionStartedAt: row.sectionStartedAt?.toISOString() ?? null,
        seq: row.seq,
        updatedAt: row.updatedAt.toISOString(),
        imamConnected: Date.now() - row.lastHeartbeatAt.getTime() < SESSION_STALE_MS,
      }
    : emptySnapshot(tenantId);
  await ctx.redis.set(SESSION_KEY(tenantId), JSON.stringify(snap));
  return snap;
}

async function persist(ctx: AppContext, snap: LiveSessionSnapshot, extra: { deviceId?: string; heartbeat?: boolean } = {}): Promise<void> {
  await ctx.redis.set(SESSION_KEY(snap.tenantId), JSON.stringify(snap));
  if (snap.sessionId) {
    await ctx.db.liveSession
      .update({
        where: { id: snap.sessionId },
        data: {
          state: snap.state,
          currentParagraphId: snap.currentParagraphId,
          currentIndex: snap.currentIndex,
          currentSection: snap.currentSection,
          autoAdvance: snap.autoAdvance,
          seq: snap.seq,
          sectionStartedAt: snap.sectionStartedAt ? new Date(snap.sectionStartedAt) : null,
          endedAt: snap.state === 'ENDED' ? new Date() : null,
          ...(extra.heartbeat ? { lastHeartbeatAt: new Date() } : {}),
          ...(extra.deviceId ? { imamDeviceId: extra.deviceId } : {}),
        },
      })
      .catch((err) => ctx.log.warn({ err }, 'session persist failed'));
  }
}

export function broadcast(ctx: AppContext, snap: LiveSessionSnapshot): void {
  ctx.io.to(ROOMS.tenant(snap.tenantId)).emit('session:state', snap);
}

export interface StartInput {
  khutbahId: string;
  force?: boolean;
  autoAdvance?: boolean;
  userId: string | null;
  deviceId: string;
}

export async function startSession(ctx: AppContext, tenantId: string, input: StartInput): Promise<LiveSessionSnapshot> {
  const current = await getSnapshot(ctx, tenantId);
  const active = await ctx.db.liveSession.findFirst({ where: { tenantId, endedAt: null } });
  if (active && current.state !== 'ENDED') {
    const stale = Date.now() - active.lastHeartbeatAt.getTime() > SESSION_STALE_MS;
    const sameDevice = active.imamDeviceId === input.deviceId;
    if (!input.force && !stale && !sameDevice) {
      throw conflict('Another imam session is active', { activeSince: active.startedAt ?? active.createdAt, deviceId: active.imamDeviceId });
    }
    if (!sameDevice && active.imamDeviceId) {
      ctx.io.to(ROOMS.imam(tenantId)).emit('imam:conflict', {
        message: 'Session taken over by another device',
        activeSince: (active.startedAt ?? active.createdAt).toISOString(),
        deviceId: input.deviceId,
      });
    }
    await ctx.db.liveSession.update({ where: { id: active.id }, data: { endedAt: new Date(), state: 'ENDED' } });
  }
  const khutbah = await getLiveKhutbah(ctx, tenantId, input.khutbahId);
  if (!khutbah) throw notFound('Khutbah');
  if (khutbah.paragraphs.length === 0) throw badRequest('Khutbah has no paragraphs');
  const first = khutbah.paragraphs[0];
  const now = new Date();
  const row = await ctx.db.liveSession.create({
    data: {
      tenantId,
      khutbahId: input.khutbahId,
      state: 'LIVE',
      currentParagraphId: first.id,
      currentIndex: 0,
      currentSection: first.sectionType,
      autoAdvance: !!input.autoAdvance,
      imamUserId: input.userId,
      imamDeviceId: input.deviceId,
      startedAt: now,
      sectionStartedAt: now,
      seq: 1,
    },
  });
  await ctx.db.khutbah.updateMany({ where: { id: input.khutbahId, tenantId }, data: { status: 'DELIVERED' } });
  const snap: LiveSessionSnapshot = {
    sessionId: row.id,
    tenantId,
    state: 'LIVE',
    khutbahId: input.khutbahId,
    currentParagraphId: first.id,
    currentIndex: 0,
    currentSection: first.sectionType,
    autoAdvance: !!input.autoAdvance,
    startedAt: now.toISOString(),
    sectionStartedAt: now.toISOString(),
    seq: 1,
    updatedAt: now.toISOString(),
    imamConnected: true,
  };
  await ctx.redis.set(SESSION_KEY(tenantId), JSON.stringify(snap));
  ctx.io.to(ROOMS.tenant(tenantId)).emit('session:khutbah', khutbah);
  broadcast(ctx, snap);
  scheduleAutoAdvance(ctx, snap, khutbah);
  return snap;
}

export async function applyCommand(ctx: AppContext, tenantId: string, cmd: SessionCommand, deviceId?: string): Promise<LiveSessionSnapshot> {
  const snap = await getSnapshot(ctx, tenantId);
  if (!snap.sessionId || snap.state === 'ENDED' || !snap.khutbahId) {
    if (cmd.type === 'end') return snap;
    throw conflict('No active session');
  }
  const khutbah = await getLiveKhutbah(ctx, tenantId, snap.khutbahId);
  if (!khutbah) throw notFound('Khutbah');
  const paragraphs = khutbah.paragraphs;
  const idx = Math.max(0, paragraphs.findIndex((p) => p.id === snap.currentParagraphId));
  const next = { ...snap };
  const nowIso = new Date().toISOString();

  const goto = (i: number) => {
    const clamped = Math.min(Math.max(i, 0), paragraphs.length - 1);
    const p = paragraphs[clamped];
    next.currentIndex = clamped;
    next.currentParagraphId = p.id;
    if (p.sectionType !== next.currentSection) {
      next.currentSection = p.sectionType;
      next.sectionStartedAt = nowIso;
    }
    if (next.state === 'PAUSED' || next.state === 'IMPROV') next.state = 'LIVE';
  };

  switch (cmd.type) {
    case 'next':
      goto(idx + 1);
      break;
    case 'prev':
      goto(idx - 1);
      break;
    case 'goto': {
      const i = paragraphs.findIndex((p) => p.id === cmd.paragraphId);
      if (i === -1) throw notFound('Paragraph');
      goto(i);
      break;
    }
    case 'section': {
      const i = paragraphs.findIndex((p) => p.sectionType === cmd.section);
      if (i === -1) throw notFound(`Section ${cmd.section}`);
      goto(i);
      break;
    }
    case 'pause':
      next.state = 'PAUSED';
      break;
    case 'resume':
      next.state = 'LIVE';
      break;
    case 'improv':
      next.state = next.state === 'IMPROV' ? 'LIVE' : 'IMPROV';
      break;
    case 'autoAdvance':
      next.autoAdvance = cmd.enabled;
      break;
    case 'end':
      next.state = 'ENDED';
      break;
  }
  next.seq = snap.seq + 1;
  next.updatedAt = nowIso;
  next.imamConnected = true;
  await persist(ctx, next, { deviceId, heartbeat: true });
  broadcast(ctx, next);
  if (next.state === 'ENDED') {
    clearAuto(tenantId);
    // Reset to WAITING so late displays show the idle screen; keep ENDED visible for a few seconds.
    setTimeout(() => {
      void resetToWaiting(ctx, tenantId, next.sessionId);
    }, 8000);
  } else {
    scheduleAutoAdvance(ctx, next, khutbah);
  }
  return next;
}

async function resetToWaiting(ctx: AppContext, tenantId: string, sessionId: string | null) {
  const cur = await getSnapshot(ctx, tenantId);
  if (cur.sessionId !== sessionId || cur.state !== 'ENDED') return;
  const snap = emptySnapshot(tenantId);
  await ctx.redis.set(SESSION_KEY(tenantId), JSON.stringify(snap));
  broadcast(ctx, snap);
}

export async function heartbeat(ctx: AppContext, tenantId: string, deviceId: string, connected: boolean): Promise<void> {
  const snap = await getSnapshot(ctx, tenantId);
  if (!snap.sessionId) return;
  if (snap.imamConnected !== connected) {
    snap.imamConnected = connected;
    snap.updatedAt = new Date().toISOString();
    await persist(ctx, snap, { deviceId, heartbeat: connected });
    broadcast(ctx, snap);
  } else if (connected) {
    await ctx.db.liveSession.update({ where: { id: snap.sessionId }, data: { lastHeartbeatAt: new Date() } }).catch(() => undefined);
  }
}

function clearAuto(tenantId: string) {
  const t = autoTimers.get(tenantId);
  if (t) clearTimeout(t);
  autoTimers.delete(tenantId);
}

/** Auto-advance: move to the next paragraph after its estimated reading time (fallback when the imam can't tap). */
function scheduleAutoAdvance(ctx: AppContext, snap: LiveSessionSnapshot, khutbah: LiveKhutbah) {
  clearAuto(snap.tenantId);
  if (!snap.autoAdvance || snap.state !== 'LIVE') return;
  const p = khutbah.paragraphs[snap.currentIndex];
  if (!p || snap.currentIndex >= khutbah.paragraphs.length - 1) return;
  const ms = Math.max(3000, p.estimatedSeconds * 1000);
  const expectedSeq = snap.seq;
  autoTimers.set(
    snap.tenantId,
    setTimeout(async () => {
      try {
        const cur = await getSnapshot(ctx, snap.tenantId);
        if (cur.seq !== expectedSeq || !cur.autoAdvance || cur.state !== 'LIVE') return;
        await applyCommand(ctx, snap.tenantId, { type: 'next' });
      } catch (err) {
        ctx.log.warn({ err }, 'auto-advance failed');
      }
    }, ms),
  );
}

export function sectionOf(khutbah: LiveKhutbah, paragraphId: string | null): SectionType | null {
  return khutbah.paragraphs.find((p) => p.id === paragraphId)?.sectionType ?? null;
}
