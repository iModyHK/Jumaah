export type Route = { name: 'token' } | { name: 'screen'; token: string } | { name: 'mobile'; slug: string };

/** Base path the app is served from (Vite `base`), without trailing slash. */
export function basePath(): string {
  const b = import.meta.env.BASE_URL || '/display/';
  return b.replace(/\/+$/, '');
}

/**
 * Routes (no router library):
 *   /display/            -> token entry
 *   /display/<token>     -> wall screen
 *   /display/m/<slug>    -> public mobile page
 *   /display/m           -> public mobile page of the mosque implied by the address (hosted edition:
 *                           alnoor.jumaah.net/display/m); the slug is resolved from /api/public/host
 */
export function parseRoute(pathname: string = window.location.pathname): Route {
  const base = basePath();
  let p = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  p = p.replace(/^\/+|\/+$/g, '');
  if (!p || p === 'index.html') return { name: 'token' };
  const parts = p.split('/');
  if (parts[0] === 'm') {
    const slug = parts[1] ? safeDecode(parts[1]) : '';
    return { name: 'mobile', slug };
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
