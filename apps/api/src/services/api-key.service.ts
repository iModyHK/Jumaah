/**
 * API keys (hosted edition, plans with the `api` feature). A key stands in for a mosque admin: `jk_…` in the
 * Authorization header, hashed at rest, read-only or read-write, revocable. Keys can never manage users, keys,
 * webhooks or the subscription, and every request checks that the plan still includes the API.
 */
import { sha256 } from '@jumaah/db';
import type { AppContext } from '../lib/context.js';
import { tenantFeatures } from './features.service.js';

export interface ResolvedApiKey {
  id: string;
  tenantId: string;
  name: string;
  readOnly: boolean;
}

const CACHE_TTL_S = 60;
const cacheKey = (hash: string) => `apikey:${hash}`;

/** Paths an API key may never call, whatever its scope. */
export const API_KEY_FORBIDDEN = /^\/api\/(api-keys|webhooks|users|auth|tenants|tenant\/domain|organisations?|platform|backups|sync|network)(\/|$|\?)/;

export function looksLikeApiKey(token: string): boolean {
  return token.startsWith('jk_');
}

/** The mosque and scope behind a key, or null when unknown, revoked, suspended or no longer in the plan. */
export async function resolveApiKey(ctx: AppContext, token: string): Promise<ResolvedApiKey | null> {
  const hash = sha256(token);
  const key = cacheKey(hash);
  try {
    const cached = await ctx.redis.get(key);
    if (cached !== null) return cached ? (JSON.parse(cached) as ResolvedApiKey) : null;
  } catch {
    /* fall through */
  }
  const row = await ctx.db.apiKey.findUnique({ where: { keyHash: hash }, include: { tenant: { select: { isActive: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true } } } });
  const ok = !!row && !row.revokedAt && row.tenant.isActive && row.tenant.subscriptionStatus !== 'SUSPENDED' && tenantFeatures(row.tenant).features.api;
  const value = ok && row ? { id: row.id, tenantId: row.tenantId, name: row.name, readOnly: row.readOnly } : null;
  await ctx.redis.set(key, value ? JSON.stringify(value) : '', 'EX', CACHE_TTL_S).catch(() => undefined);
  return value;
}

export async function forgetApiKey(ctx: AppContext, keyHash: string): Promise<void> {
  await ctx.redis.del(cacheKey(keyHash)).catch(() => undefined);
}

/** Remember when a key was last used: at most one write a minute per key, across every API instance (Redis NX). */
export function touchApiKey(ctx: AppContext, id: string): void {
  void ctx.redis
    .set(`apikey:touch:${id}`, '1', 'EX', 60, 'NX')
    .then((r) => (r === 'OK' ? ctx.db.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } }) : null))
    .catch(() => undefined);
}
