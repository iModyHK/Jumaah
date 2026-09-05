/**
 * Attendance insight (paid editions). Screens and phones are counted as they connect; while a khutbah is live the
 * peaks and the distinct phones are kept in Redis under the session id, and written to the LiveSession row when the
 * session ends. Nothing personal is stored: the phone's random device id is only used to count distinct phones and
 * is dropped with the Redis set (48 h).
 */
import type { Db } from '@jumaah/db';
import type { InsightDto, InsightSessionDto } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';

type ViewerRole = 'DISPLAY' | 'PUBLIC';

interface Counts {
  displays: number;
  phones: number;
}

const counts = new Map<string, Counts>();
/** Device ids of the phones connected right now, per mosque (a phone may hold several sockets briefly). */
const phones = new Map<string, Map<string, number>>();
const STATS_TTL_S = 48 * 60 * 60;
const statsKey = (tenantId: string, sessionId: string) => `stats:${tenantId}:${sessionId}`;

export function viewerCounts(tenantId: string): Counts {
  return counts.get(tenantId) ?? { displays: 0, phones: 0 };
}

/** Screens + phones connected right now (what the imam and admin see as "active displays"). */
export function viewerTotal(tenantId: string): number {
  const c = viewerCounts(tenantId);
  return c.displays + c.phones;
}

export function viewerConnected(ctx: AppContext, tenantId: string, sessionId: string | null, role: ViewerRole, deviceId?: string): void {
  const c = { ...viewerCounts(tenantId) };
  if (role === 'DISPLAY') c.displays += 1;
  else c.phones += 1;
  counts.set(tenantId, c);
  if (role === 'PUBLIC' && deviceId) {
    const m = phones.get(tenantId) ?? new Map<string, number>();
    m.set(deviceId, (m.get(deviceId) ?? 0) + 1);
    phones.set(tenantId, m);
  }
  if (sessionId) void recordPeaks(ctx, tenantId, sessionId, c, role === 'PUBLIC' && deviceId ? [deviceId] : []);
}

export function viewerDisconnected(tenantId: string, role: ViewerRole, deviceId?: string): void {
  const c = { ...viewerCounts(tenantId) };
  if (role === 'DISPLAY') c.displays = Math.max(0, c.displays - 1);
  else c.phones = Math.max(0, c.phones - 1);
  counts.set(tenantId, c);
  if (role === 'PUBLIC' && deviceId) {
    const m = phones.get(tenantId);
    const n = (m?.get(deviceId) ?? 0) - 1;
    if (m) {
      if (n <= 0) m.delete(deviceId);
      else m.set(deviceId, n);
    }
  }
}

async function recordPeaks(ctx: AppContext, tenantId: string, sessionId: string, c: Counts, deviceIds: string[]): Promise<void> {
  try {
    const key = statsKey(tenantId, sessionId);
    const [pd, pp] = await ctx.redis.hmget(key, 'peakDisplays', 'peakPhones');
    const data: Record<string, string> = {};
    if (c.displays > Number(pd ?? 0)) data.peakDisplays = String(c.displays);
    if (c.phones > Number(pp ?? 0)) data.peakPhones = String(c.phones);
    if (Object.keys(data).length) await ctx.redis.hset(key, data);
    if (deviceIds.length) await ctx.redis.sadd(`${key}:phones`, ...deviceIds);
    await ctx.redis.expire(key, STATS_TTL_S);
    await ctx.redis.expire(`${key}:phones`, STATS_TTL_S);
  } catch (err) {
    ctx.log.warn({ err }, 'insight: recording viewers failed');
  }
}

/** A session just started: whoever is already connected counts towards its peaks and distinct phones. */
export function seedSessionStats(ctx: AppContext, tenantId: string, sessionId: string): void {
  const c = viewerCounts(tenantId);
  const ids = [...(phones.get(tenantId)?.keys() ?? [])];
  if (c.displays || c.phones || ids.length) void recordPeaks(ctx, tenantId, sessionId, c, ids);
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
