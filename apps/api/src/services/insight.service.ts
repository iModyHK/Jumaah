/**
 * Attendance insight (paid editions). Connected screens and phones are counted from the socket rooms, which the
 * Redis adapter shares across API processes, so the numbers are right however many instances run. While a khutbah
 * is live the peaks and the distinct phones are kept in Redis under the session id, and written to the LiveSession
 * row when the session ends. Nothing personal is stored: the phone's random device id is only used to count distinct
 * phones and is dropped with the Redis set (48 h).
 */
import type { Db } from '@jumaah/db';
import { ROOMS, type InsightDto, type InsightSessionDto } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';

export interface Counts {
  displays: number;
  phones: number;
  /** Device ids of the phones connected right now. */
  phoneDevices: string[];
}

const STATS_TTL_S = 48 * 60 * 60;
const statsKey = (tenantId: string, sessionId: string) => `stats:${tenantId}:${sessionId}`;

/** Screens and phones connected to a mosque right now, across every API instance. */
export async function viewerCounts(ctx: AppContext, tenantId: string): Promise<Counts> {
  try {
    const sockets = await ctx.io.in(ROOMS.displays(tenantId)).fetchSockets();
    let displays = 0;
    const phones = new Set<string>();
    let phoneSockets = 0;
    for (const s of sockets) {
      if (s.data.role === 'DISPLAY') displays += 1;
      else if (s.data.role === 'PUBLIC') {
        phoneSockets += 1;
        if (s.data.deviceId) phones.add(s.data.deviceId);
      }
    }
    return { displays, phones: phoneSockets, phoneDevices: [...phones] };
  } catch (err) {
    ctx.log.warn({ err, tenantId }, 'insight: counting viewers failed');
    return { displays: 0, phones: 0, phoneDevices: [] };
  }
}

/** Screens + phones connected right now (what the imam and admin see as "active displays"). */
export async function viewerTotal(ctx: AppContext, tenantId: string): Promise<number> {
  const c = await viewerCounts(ctx, tenantId);
  return c.displays + c.phones;
}

async function recordPeaks(ctx: AppContext, tenantId: string, sessionId: string, c: Counts): Promise<void> {
  try {
    const key = statsKey(tenantId, sessionId);
    const [pd, pp] = await ctx.redis.hmget(key, 'peakDisplays', 'peakPhones');
    const data: Record<string, string> = {};
    if (c.displays > Number(pd ?? 0)) data.peakDisplays = String(c.displays);
    if (c.phones > Number(pp ?? 0)) data.peakPhones = String(c.phones);
    if (Object.keys(data).length) await ctx.redis.hset(key, data);
    if (c.phoneDevices.length) await ctx.redis.sadd(`${key}:phones`, ...c.phoneDevices);
    await ctx.redis.expire(key, STATS_TTL_S);
    await ctx.redis.expire(`${key}:phones`, STATS_TTL_S);
  } catch (err) {
    ctx.log.warn({ err }, 'insight: recording viewers failed');
  }
}

/** A viewer joined or left: refresh the counts and, during a live session, its peaks. Returns the total for `displays:count`. */
export async function viewersChanged(ctx: AppContext, tenantId: string, sessionId: string | null): Promise<number> {
  const c = await viewerCounts(ctx, tenantId);
  if (sessionId) void recordPeaks(ctx, tenantId, sessionId, c);
  return c.displays + c.phones;
}

/** A session just started: whoever is already connected counts towards its peaks and distinct phones. */
export async function seedSessionStats(ctx: AppContext, tenantId: string, sessionId: string): Promise<void> {
  const c = await viewerCounts(ctx, tenantId);
  if (c.displays || c.phones) await recordPeaks(ctx, tenantId, sessionId, c);
}

export async function readSessionStats(ctx: AppContext, tenantId: string, sessionId: string): Promise<{ peakDisplays: number; peakPhones: number; uniquePhones: number }> {
  try {
    const key = statsKey(tenantId, sessionId);
    const [h, unique] = await Promise.all([ctx.redis.hgetall(key), ctx.redis.scard(`${key}:phones`)]);
    return { peakDisplays: Number(h.peakDisplays ?? 0), peakPhones: Number(h.peakPhones ?? 0), uniquePhones: unique };
  } catch (err) {
    ctx.log.warn({ err }, 'insight: reading stats failed');
    return { peakDisplays: 0, peakPhones: 0, uniquePhones: 0 };
  }
}

/** Past sessions with their attendance numbers, newest first, and a small summary. */
export async function listInsight(db: Db, tenantId: string, take = 26): Promise<InsightDto> {
  const rows = await db.liveSession.findMany({
    where: { tenantId, endedAt: { not: null }, khutbah: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take,
    include: { khutbah: { select: { title: true, gregorianDate: true, hijriDate: true, imamName: true } } },
  });
  const sessions: InsightSessionDto[] = rows.map((r) => {
    const started = r.startedAt ?? r.createdAt;
    const durationSec = r.endedAt ? Math.max(0, Math.round((r.endedAt.getTime() - started.getTime()) / 1000)) : 0;
    return {
      id: r.id,
      khutbahId: r.khutbahId,
      title: r.khutbah.title,
      gregorianDate: r.khutbah.gregorianDate.toISOString().slice(0, 10),
      hijriDate: r.khutbah.hijriDate,
      imamName: r.khutbah.imamName,
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      durationSec,
      peakDisplays: r.peakDisplays,
      peakPhones: r.peakPhones,
      uniquePhones: r.uniquePhones,
    };
  });
  const n = sessions.length;
  const avg = (f: (s: InsightSessionDto) => number) => (n ? Math.round((sessions.reduce((a, s) => a + f(s), 0) / n) * 10) / 10 : 0);
  return {
    sessions,
    summary: {
      sessions: n,
      avgPhones: avg((s) => s.uniquePhones),
      maxPhones: sessions.reduce((m, s) => Math.max(m, s.uniquePhones), 0),
      avgDisplays: avg((s) => s.peakDisplays),
      avgDurationSec: avg((s) => s.durationSec),
    },
  };
}
