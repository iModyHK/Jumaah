import type { ExtRoute } from './extensions';

export type Route =
  | { name: 'token' }
  | { name: 'screen'; token: string }
  | { name: 'mobile'; slug: string }
  | { name: 'poster'; slug: string; size: 'A4' | 'A3' }
  | { name: 'ext'; route: ExtRoute; matcher: number };

/** Base path the app is served from (Vite `base`), without trailing slash. */
export function basePath(): string {
  const b = import.meta.env.BASE_URL || '/display/';
  return b.replace(/\/+$/, '');
}

/**
 * Routes (no router library):
 *   /display/                 -> token entry
 *   /display/<token>          -> wall screen
 *   /display/m/<slug>         -> public mobile page
 *   /display/m                -> public mobile page of the mosque implied by the address (per-mosque hosts, an
 *                                extension); the slug is resolved from /api/public/host
 *   /display/poster/<slug>    -> printable QR poster (?size=A4|A3)
 *   anything else an extension matches (Jumaah Cloud: the public archive, invoices)
 */
export type ExtMatcher = (parts: string[], search: URLSearchParams) => ExtRoute | null;

export function parseRoute(pathname: string = window.location.pathname, search: string = window.location.search, matchers: ExtMatcher[] = []): Route {
  const base = basePath();
  let p = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  p = p.replace(/^\/+|\/+$/g, '');
  if (!p || p === 'index.html') return { name: 'token' };
  const parts = p.split('/');
  if (parts[0] === 'm') {
    const slug = parts[1] ? safeDecode(parts[1]) : '';
    return { name: 'mobile', slug };
  }
  if (parts[0] === 'poster' && parts[1]) {
    const size = new URLSearchParams(search).get('size') === 'A3' ? 'A3' : 'A4';
    return { name: 'poster', slug: safeDecode(parts[1]), size };
  }
  const decoded = parts.map(safeDecode);
  const q = new URLSearchParams(search);
  for (const m of matchers) {
    const r = m(decoded, q);
    if (r) return { name: 'ext', route: r, matcher: matchers.indexOf(m) };
  }
  return { name: 'screen', token: safeDecode(parts[0]) };
}

export function screenUrl(token: string): string {
  return `${basePath()}/${encodeURIComponent(token)}`;
}

export function mobileUrl(slug: string): string {
  return `${basePath()}/m/${encodeURIComponent(slug)}`;
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
