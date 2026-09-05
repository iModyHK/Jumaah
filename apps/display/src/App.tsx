import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiBaseUrl } from '@jumaah/ui';
import { parseRoute } from './routes';
import { Screen } from './screens/Screen';
import { Mobile } from './screens/Mobile';
import { Archive } from './screens/Archive';
import { InvoicePage } from './screens/Invoice';
import { Poster } from './screens/Poster';
import { TokenEntry } from './screens/TokenEntry';
import { CenterMessage } from './components/Overlays';

export function App() {
  const [route, setRoute] = useState(() => parseRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  switch (route.name) {
    case 'screen':
      return <Screen key={route.token} token={route.token} />;
    case 'mobile':
      return route.slug ? <Mobile key={route.slug} slug={route.slug} /> : <HostMobile />;
    case 'poster':
      return <Poster key={`${route.slug}-${route.size}`} slug={route.slug} size={route.size} />;
    case 'invoice':
      return <InvoicePage key={route.number} number={route.number} token={route.token} paid={route.paid} />;
    case 'archive':
      return <Archive key={`${route.slug}-${route.khutbahId ?? ''}`} slug={route.slug} khutbahId={route.khutbahId} />;
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
