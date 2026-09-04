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
 */
export function parseRoute(pathname: string = window.location.pathname): Route {
  const base = basePath();
  let p = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  p = p.replace(/^\/+|\/+$/g, '');
  if (!p || p === 'index.html') return { name: 'token' };
  const parts = p.split('/');
  if (parts[0] === 'm') {
    const slug = parts[1] ? safeDecode(parts[1]) : '';
    return slug ? { name: 'mobile', slug } : { name: 'token' };
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
