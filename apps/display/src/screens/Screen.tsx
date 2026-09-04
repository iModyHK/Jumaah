import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionDot, LangText } from '@jumaah/ui';
import { useKiosk, useTheme } from '../kiosk';
import { activeKhutbah, currentParagraphs, useLiveStore } from '../store';
import { Clock } from '../components/Clock';
import { EndedScreen } from '../components/EndedScreen';
import { IdleScreen } from '../components/IdleScreen';
import { CenterMessage, PausedPill, ReconnectBanner } from '../components/Overlays';
import { effectiveLayout, Panels } from '../components/Panels';

/** The wall screen: /display/<token> */
export function Screen({ token }: { token: string }) {
  const live = useLiveStore({ kind: 'display', token });
  const { t, i18n } = useTranslation();
  const locale = live.tenant?.locale;
  useEffect(() => {
    if (locale && i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale, i18n]);
  useTheme(live.config?.theme);
  useKiosk(true);

  const khutbah = activeKhutbah(live);
  const { current, previous } = useMemo(() => currentParagraphs(live.session, khutbah), [live.session, khutbah]);

  if (live.phase === 'invalid') return <CenterMessage>{t('display.invalidToken')}</CenterMessage>;
  if (live.phase !== 'ready' || !live.tenant || !live.config || !live.session) return <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;

  const { tenant, config, session } = live;
  const languages = (config.languages.length ? config.languages : tenant.languages.length ? tenant.languages.slice(0, 1) : ['en']).filter(Boolean);
  const layout = effectiveLayout(config.layout, languages.length);
  const state = session.state;
  const logoUrl = config.logoUrl ?? tenant.logoUrl;

  let content: React.ReactNode;
  if (state === 'ENDED') {
    content = <EndedScreen languages={languages} />;
  } else if (state === 'WAITING' || !session.khutbahId) {
    content = <IdleScreen tenant={tenant} logoUrl={logoUrl} offsetMs={live.offsetMs} qrUrl={config.showQr && config.publicUrl ? config.publicUrl : null} languages={languages} />;
  } else if (!khutbah && state !== 'IMPROV') {
    // The snapshot arrived before its khutbah (rare: reconnect ordering). Render immediately once it lands.
    content = <CenterMessage spinner>{t('display.connecting')}</CenterMessage>;
  } else {
    content = (
      <Panels languages={languages} layout={layout} fontScale={config.fontScale || 1} showPrevious={config.showPrevious} showArabic={config.showArabic} state={state} current={current} previous={previous} mode="wall" />
    );
  }

  return (
    <div className="j-wall">
      {!live.connected && <ReconnectBanner />}
      {state === 'PAUSED' && <PausedPill languages={languages} />}
      {content}
      <footer className="j-bar">
        <LangText lang={tenant.locale} as="span" style={{ fontWeight: 600, color: 'var(--j-fg)' }}>
          {tenant.name}
        </LangText>
        {khutbah && (state === 'LIVE' || state === 'PAUSED' || state === 'IMPROV') ? (
          <LangText lang="ar" as="span" style={{ textAlign: 'center' }}>
            {khutbah.title}
            {khutbah.imamName ? ` — ${khutbah.imamName}` : ''}
          </LangText>
        ) : (
          <span />
        )}
        <span className="inline-flex items-center gap-4">
          <ConnectionDot connected={live.connected} />
          <Clock offsetMs={live.offsetMs} timeZone={tenant.timezone} className="font-semibold tabular-nums" />
        </span>
      </footer>
    </div>
  );
}
