import { useEffect, useState } from 'react';
import { parseRoute } from './routes';
import { Screen } from './screens/Screen';
import { Mobile } from './screens/Mobile';
import { TokenEntry } from './screens/TokenEntry';

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
      return <Mobile key={route.slug} slug={route.slug} />;
    default:
      return <TokenEntry />;
  }
}
