import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguage } from '@jumaah/shared';
import { Button, ConnectionDot, LangText, useLocalStorage, useWakeLock } from '@jumaah/ui';
import { useTheme } from '../kiosk';
import { activeKhutbah, currentParagraphs, useLiveStore } from '../store';
import { EndedScreen } from '../components/EndedScreen';
import { IdleScreen } from '../components/IdleScreen';
import { CenterMessage, PausedPill, ReconnectBanner } from '../components/Overlays';
import { Panels } from '../components/Panels';

interface MobilePrefs {
  langs: string[];
  arabic: boolean;
  scale: number;
}

const SCALE_MIN = 0.7;
const SCALE_MAX = 1.8;
const SCALE_STEP = 0.1;

function prefersLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/** Public phone page: /display/m/<slug> */
export function Mobile({ slug }: { slug: string }) {
  const live = useLiveStore({ kind: 'mobile', slug });
  const { t, i18n } = useTranslation();
  const [prefs, setPrefs] = useLocalStorage<MobilePrefs>(`jumaah.mobile.prefs.${slug}`, { langs: [], arabic: false, scale: 1 });
  useTheme(prefersLight() ? 'light' : 'dark');
  useWakeLock(live.session?.state === 'LIVE' || live.session?.state === 'PAUSED');

  const locale = live.tenant?.locale;
  useEffect(() => {
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);

  const available = useMemo(() => (live.tenant?.languages ?? []).filter((l) => l !== 'ar'), [live.tenant?.languages]);
  const selected = useMemo(() => {
    const kept = prefs.langs.filter((l) => available.includes(l));
    if (kept.length) return kept;
    const guess = navigator.languages?.map((l) => l.split('-')[0]).find((l) => available.includes(l));
    return guess ? [guess] : available.slice(0, 1);
  }, [prefs.langs, available]);

  const khutbah = activeKhutbah(live);
  const { current, previous } = useMemo(() => currentParagraphs(live.session, khutbah), [live.session, khutbah]);

  if (live.phase === 'invalid') return <CenterMessage>{t('errors.NOT_FOUND')}</CenterMessage>;
  if (live.phase !== 'ready' || !live.tenant || !live.session) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;

  const { tenant, session } = live;
  const state = session.state;
  const toggleLang = (l: string) => {
    const next = selected.includes(l) ? selected.filter((x) => x !== l) : [...selected, l];
    if (next.length === 0) return;
    setPrefs((p) => ({ ...p, langs: next }));
  };
  const bump = (d: number) => setPrefs((p) => ({ ...p, scale: Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, p.scale + d)) * 100) / 100 }));
  const showArabic = prefs.arabic || (selected.length === 0 && available.length === 0);

  let body: React.ReactNode;
  if (state === 'ENDED') body = <EndedScreen languages={selected} />;
  else if (state === 'WAITING' || !session.khutbahId) body = <IdleScreen tenant={tenant} logoUrl={tenant.logoUrl} offsetMs={live.offsetMs} qrUrl={null} languages={selected} compact />;
  else if (!khutbah && state !== 'IMPROV') body = <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  else body = <Panels languages={selected} layout="column" fontScale={prefs.scale} showPrevious showArabic={showArabic} state={state} current={current} previous={previous} mode="mobile" />;

  return (
    <div className="j-mobile">
      {!live.connected && <ReconnectBanner />}
      {state === 'PAUSED' && <PausedPill languages={selected} />}
      <header className="j-mobile-header">
        <div className="flex items-center justify-between gap-3">
          <LangText lang={tenant.locale} as="span" style={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.3 }}>
            {tenant.name}
          </LangText>
          <ConnectionDot connected={live.connected} />
        </div>
        <div className="flex items-center gap-2">
          <div className="j-chips flex-1" role="group" aria-label={t('display.chooseLanguage')}>
            {available.map((l) => (
              <button key={l} type="button" className="j-chip" data-on={selected.includes(l)} onClick={() => toggleLang(l)} lang={l} dir={getLanguage(l).dir} style={{ fontFamily: getLanguage(l).fontFamily }}>
                {getLanguage(l).nativeName}
              </button>
            ))}
            <button type="button" className="j-chip" data-on={showArabic} onClick={() => setPrefs((p) => ({ ...p, arabic: !p.arabic }))} lang="ar" dir="rtl" style={{ fontFamily: getLanguage('ar').fontFamily }}>
              {getLanguage('ar').nativeName}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1" dir="ltr">
            <Button className="!px-3 !py-1" onClick={() => bump(-SCALE_STEP)} disabled={prefs.scale <= SCALE_MIN + 1e-6} aria-label="smaller">
              A−
            </Button>
            <Button className="!px-3 !py-1" onClick={() => bump(SCALE_STEP)} disabled={prefs.scale >= SCALE_MAX - 1e-6} aria-label="larger">
              A+
            </Button>
          </div>
        </div>
      </header>
      <main className="j-mobile-body">{body}</main>
    </div>
  );
}
