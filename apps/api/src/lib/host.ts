/** Host and address helpers of the core. Per-mosque hosts and custom domains are an extension (see hooks). */
import type { AppContext } from './context.js';
import type { Config } from '../config.js';

/** Slugs no mosque may take on any server: the apps' own path prefixes. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'imam', 'display', 'static', 'www']);

/** Lower-case host name without port, or null when the header is missing or malformed. */
export function hostnameOf(hostHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return null;
  const h = raw.trim().toLowerCase();
  if (!h) return null;
  if (h.startsWith('[')) return null; // IPv6 literal is never a tenant host
  const host = h.split(':')[0];
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/**
 * CORS origin check: configured origins are allowed, and the platform's own address. With nothing configured every
 * origin passes on a single-address install (`permissive`); an extension that names mosques by host decides the rest.
 * Requests without an Origin header pass as before.
 */
export function isAllowedOrigin(origin: string | undefined, config: Pick<Config, 'PUBLIC_BASE_URL' | 'corsOrigins'>, permissive = true): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (config.corsOrigins.length === 0 && permissive) return true;
  try {
    return new URL(origin).host.toLowerCase() === new URL(config.PUBLIC_BASE_URL).host.toLowerCase();
  } catch {
    return false;
  }
}

/** Base URL for links that belong to one mosque (screen links, phone page, invitations). */
export async function tenantBaseUrl(ctx: AppContext, tenant: { id: string; slug: string }): Promise<string> {
  const ext = await ctx.hooks.tenantBaseUrl?.(ctx, tenant);
  return (ext ?? ctx.config.PUBLIC_BASE_URL).replace(/\/$/, '');
}
