export type Route =
  | { name: 'token' }
  | { name: 'screen'; token: string }
  | { name: 'mobile'; slug: string }
  | { name: 'poster'; slug: string; size: 'A4' | 'A3' }
  | { name: 'archive'; slug: string; khutbahId: string | null }
  | { name: 'invoice'; number: string; token: string; paid: boolean };

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
 *   /display/a/<slug>         -> public archive of past khutbahs (paid editions, switched on by the mosque)
 *   /display/a/<slug>/<id>    -> one archived khutbah, readable and printable in any of its languages
 *   /display/invoice/<number> -> a printable invoice (?t=<token> is the secret that opens it)
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
  if (parts[0] === 'invoice' && parts[1]) {
    const q = new URLSearchParams(search);
    return { name: 'invoice', number: safeDecode(parts[1]), token: q.get('t') ?? '', paid: q.get('paid') === '1' };
  }
  if (parts[0] === 'a' && parts[1]) {
    return { name: 'archive', slug: safeDecode(parts[1]), khutbahId: parts[2] ? safeDecode(parts[2]) : null };
  }
  return { name: 'screen', token: safeDecode(parts[0]) };
}

export function screenUrl(token: string): string {
  return `${basePath()}/${encodeURIComponent(token)}`;
}

export function archiveUrl(slug: string, khutbahId?: string): string {
  return `${basePath()}/a/${encodeURIComponent(slug)}${khutbahId ? `/${encodeURIComponent(khutbahId)}` : ''}`;
}

export function mobileUrl(slug: string): string {
  return `${basePath()}/m/${encodeURIComponent(slug)}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
