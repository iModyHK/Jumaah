/**
 * Custom domains (hosted edition, Pro). A mosque points its own host name (khutbah.alnoor.org.sa) at its Jumaah
 * address with a CNAME; once the DNS is verified the API treats requests on that host as the mosque's, links use it,
 * and Caddy is allowed to fetch a certificate for it on demand (GET /public/domain-check).
 */
import { promises as dns } from 'node:dns';
import { HOSTNAME_RE } from '@jumaah/cloud-shared';
import type { CloudConfig as Config } from '../config.js';
import type { CloudContext as AppContext } from '../context.js';
import { hostnameOf } from '../lib/host.js';
import { tenantFeatures } from './features.js';

export interface Resolver {
  resolveCname(hostname: string): Promise<string[]>;
  resolve4(hostname: string): Promise<string[]>;
}

const CACHE_TTL_S = 60;
const cacheKey = (host: string) => `host:custom:${host}`;

/** Lower-cases and validates a host name; refuses the platform's own names. */
export function normalizeDomain(input: string, config: Pick<Config, 'PUBLIC_BASE_URL' | 'tenantBaseDomain'>): { domain: string; error: null } | { domain: null; error: string } {
  const domain = input.trim().toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME_RE.test(domain)) return { domain: null, error: 'INVALID_HOSTNAME' };
  const base = config.tenantBaseDomain;
  if (base && (domain === base || domain.endsWith('.' + base))) return { domain: null, error: 'PLATFORM_DOMAIN' };
  try {
    if (domain === new URL(config.PUBLIC_BASE_URL).hostname.toLowerCase()) return { domain: null, error: 'PLATFORM_DOMAIN' };
  } catch {
    /* PUBLIC_BASE_URL unparsable: ignore */
  }
  return { domain, error: null };
}

/** The host the mosque's CNAME must point at. */
export function cnameTarget(config: Pick<Config, 'tenantBaseDomain'>, slug: string): string | null {
  return config.tenantBaseDomain ? `${slug}.${config.tenantBaseDomain}` : null;
}

const clean = (h: string) => h.trim().toLowerCase().replace(/\.$/, '');

/**
 * Does `domain` point at `target`? A CNAME to the target is the normal answer; an A record equal to the target's
 * address is accepted too (some DNS hosts cannot CNAME an apex name).
 */
export async function checkDns(domain: string, target: string, resolver: Resolver = dns): Promise<{ ok: boolean; error: string | null }> {
  let cnames: string[] = [];
  try {
    cnames = (await resolver.resolveCname(domain)).map(clean);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'DNS_ERROR';
    // ENODATA: the name exists without a CNAME (maybe an A record). ENOTFOUND: nothing at all.
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') return { ok: false, error: `DNS_ERROR:${code}` };
  }
  if (cnames.includes(target)) return { ok: true, error: null };
  if (cnames.length) return { ok: false, error: `WRONG_TARGET:${cnames[0]}` };
  try {
    const [ours, theirs] = await Promise.all([resolver.resolve4(target), resolver.resolve4(domain)]);
    if (theirs.some((ip) => ours.includes(ip))) return { ok: true, error: null };
    return { ok: false, error: theirs.length ? `WRONG_TARGET:${theirs[0]}` : 'NO_RECORD' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'DNS_ERROR';
    return { ok: false, error: code === 'ENOTFOUND' || code === 'ENODATA' ? 'NO_RECORD' : `DNS_ERROR:${code}` };
  }
}

/**
 * The mosque behind a verified custom domain, or null. Cached for a minute: this runs on every request whose host
 * is neither the platform nor under the base domain, and for every CORS preflight from such an origin.
 */
export async function tenantByCustomDomain(ctx: AppContext, hostHeader: string | undefined): Promise<{ id: string; slug: string } | null> {
  const host = hostnameOf(hostHeader);
  if (!host) return null;
  const key = cacheKey(host);
  try {
    const cached = await ctx.redis.get(key);
    if (cached !== null) return cached ? (JSON.parse(cached) as { id: string; slug: string }) : null;
  } catch {
    /* cache miss on Redis trouble: fall through to the database */
  }
  const t = await ctx.db.tenant.findUnique({ where: { customDomain: host }, select: { id: true, slug: true, isActive: true, customDomainVerifiedAt: true, plan: true, subscriptionStatus: true, subscriptionEndsAt: true } });
  const ok = !!t && t.isActive && !!t.customDomainVerifiedAt && tenantFeatures(t).features.customDomain;
  const value = ok && t ? { id: t.id, slug: t.slug } : null;
  await ctx.redis.set(key, value ? JSON.stringify(value) : '', 'EX', CACHE_TTL_S).catch(() => undefined);
  return value;
}

export async function forgetCustomDomain(ctx: AppContext, host: string | null | undefined): Promise<void> {
  if (host) await ctx.redis.del(cacheKey(host.toLowerCase())).catch(() => undefined);
}
