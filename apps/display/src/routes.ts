export type Route = { name: 'token' } | { name: 'screen'; token: string } | { name: 'mobile'; slug: string } | { name: 'poster'; slug: string; size: 'A4' | 'A3' };

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
 *   /display/m                -> public mobile page of the mosque implied by the address (hosted edition:
 *                                alnoor.jumaah.net/display/m); the slug is resolved from /api/public/host
 *   /display/poster/<slug>    -> printable QR poster (?size=A4|A3)
 */
export function parseRoute(pathname: string = window.location.pathname, search: string = window.location.search): Route {
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
  return { name: 'screen', token: safeDecode(parts[0]) };
}

export function screenUrl(token: string): string {
  return `${basePath()}/${encodeURIComponent(token)}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
