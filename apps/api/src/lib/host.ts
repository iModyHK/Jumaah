/**
 * Hostname tenancy for the hosted edition (Jumaah Cloud).
 *
 * With TENANT_BASE_DOMAIN=jumaah.net, a request to alnoor.jumaah.net belongs to the tenant whose slug is "alnoor".
 * Without it (edge servers, single-tenant installs) nothing changes: PUBLIC_BASE_URL is used for every link.
 */
import type { Config } from '../config.js';

/** Labels that are never a mosque: the platform's own addresses. */
export const RESERVED_HOST_LABELS = new Set(['www', 'api', 'app', 'admin', 'cloud', 'mail', 'static', 'status', 'docs', 'help', 'ns1', 'ns2']);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Lower-case host name without port, or null when the header is missing or malformed. */
export function hostnameOf(hostHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return null;
  const h = raw.trim().toLowerCase();
  if (!h) return null;
  // IPv6 literal ([::1]:4000) is never a tenant host
  if (h.startsWith('[')) return null;
  const host = h.split(':')[0];
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

/**
 * The tenant slug encoded in the host name, or null when the host is the base domain itself, a reserved label,
 * a deeper subdomain (a.b.base), or not under the base domain at all.
 */
export function tenantSlugFromHost(hostHeader: string | string[] | undefined, baseDomain: string | null): string | null {
  if (!baseDomain) return null;
  const host = hostnameOf(hostHeader);
  if (!host) return null;
  const suffix = '.' + baseDomain;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return null;
  if (RESERVED_HOST_LABELS.has(label)) return null;
  return SLUG_RE.test(label) ? label : null;
}

/** Scheme of PUBLIC_BASE_URL (https unless the platform itself runs on plain http, e.g. local development). */
function schemeOf(publicBaseUrl: string): string {
  return publicBaseUrl.startsWith('http://') ? 'http' : 'https';
}

/**
 * Base URL for links that belong to one mosque (screen links, phone page, invitations).
 * Hosted edition: https://<slug>.<base domain>. Otherwise PUBLIC_BASE_URL.
 */
export function tenantPublicBaseUrl(config: Pick<Config, 'PUBLIC_BASE_URL' | 'tenantBaseDomain'>, slug: string): string {
  if (config.tenantBaseDomain && SLUG_RE.test(slug)) return `${schemeOf(config.PUBLIC_BASE_URL)}://${slug}.${config.tenantBaseDomain}`;
  return config.PUBLIC_BASE_URL.replace(/\/$/, '');
}

/**
 * CORS origin check. Explicitly configured origins are always allowed; with a base domain, the platform host and every
 * tenant host under it are allowed too. Requests without an Origin header (curl, same-origin) pass as before.
 */
export function isAllowedOrigin(origin: string | undefined, config: Pick<Config, 'PUBLIC_BASE_URL' | 'corsOrigins' | 'tenantBaseDomain'>): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes(origin)) return true;
  if (!config.tenantBaseDomain) return config.corsOrigins.length === 0;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host === config.tenantBaseDomain) return true;
  try {
    if (host === new URL(config.PUBLIC_BASE_URL).hostname.toLowerCase()) return true;
  } catch {
    /* PUBLIC_BASE_URL unparsable: ignore */
  }
  const suffix = '.' + config.tenantBaseDomain;
  if (!host.endsWith(suffix)) return false;
  const label = host.slice(0, -suffix.length);
  if (!label || label.includes('.')) return false;
  return RESERVED_HOST_LABELS.has(label) || SLUG_RE.test(label);
}
