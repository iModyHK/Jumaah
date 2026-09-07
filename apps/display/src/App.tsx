import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiBaseUrl } from '@jumaah/ui';
import { parseRoute } from './routes';
import { Screen } from './screens/Screen';
import { Mobile } from './screens/Mobile';
import { Poster } from './screens/Poster';
import { TokenEntry } from './screens/TokenEntry';
import { CenterMessage } from './components/Overlays';
import { useExtensions } from './extensions';

export function App() {
  const ext = useExtensions();
  const matchers = ext.routes.map((r) => r.match);
  const [route, setRoute] = useState(() => parseRoute(undefined, undefined, matchers));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(undefined, undefined, matchers));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  switch (route.name) {
    case 'screen':
      return <Screen key={route.token} token={route.token} />;
    case 'mobile':
      return route.slug ? <Mobile key={route.slug} slug={route.slug} /> : <HostMobile />;
    case 'poster':
      return <Poster key={`${route.slug}-${route.size}`} slug={route.slug} size={route.size} />;
    case 'ext':
      return <>{ext.routes[route.matcher]?.render(route.route)}</>;
    default:
      return <TokenEntry />;
  }
}

/** /display/m without a slug: ask the API which mosque this address belongs to (hosted edition). */
function HostMobile() {
  const { t } = useTranslation();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetch(apiBaseUrl() + '/api/public/host', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { tenant?: { slug: string } | null } | null) => {
        if (!cancelled) setSlug(info?.tenant?.slug ?? null);
      })
      .catch(() => {
        if (!cancelled) setSlug(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (slug === undefined) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  if (!slug) return <TokenEntry />;
  return <Mobile key={slug} slug={slug} />;
}
