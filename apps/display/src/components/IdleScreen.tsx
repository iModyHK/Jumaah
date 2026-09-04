import { useTranslation } from 'react-i18next';
import type { TenantPublicInfo } from '@jumaah/shared';
import { LangText } from '@jumaah/ui';
import { phrase } from '../phrases';
import { useClock } from './Clock';
import { QrCode } from './QrCode';

const PRAYER_ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] as const;

export function IdleScreen({
  tenant,
  logoUrl,
  offsetMs,
  qrUrl,
  languages,
  compact = false,
}: {
  tenant: TenantPublicInfo;
  logoUrl: string | null;
  offsetMs: number;
  /** When set, a QR code + caption is rendered (wall screens only). */
  qrUrl: string | null;
  /** Panel languages: a "waiting" phrase is shown in each of them. */
  languages: string[];
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const time = useClock(offsetMs, tenant.timezone);
  const prayers = PRAYER_ORDER.filter((k) => tenant.prayerTimes?.[k]);
  const extra = languages.filter((l) => l !== 'ar').slice(0, 4);

  return (
    <div className="j-idle j-fade-in">
      {logoUrl && <img src={logoUrl} alt="" className="j-idle-logo" draggable={false} />}
      <LangText lang={tenant.locale} as="h1" className="j-idle-name" style={{ textAlign: 'center', margin: 0 }}>
        {tenant.name}
      </LangText>
      {tenant.welcomeMessage && (
        <LangText lang="ar" className="j-idle-welcome" style={{ textAlign: 'center' }}>
          {tenant.welcomeMessage}
        </LangText>
      )}
      {tenant.welcomeMessageEn && (
        <LangText lang="en" className="j-idle-welcome" style={{ textAlign: 'center' }}>
          {tenant.welcomeMessageEn}
        </LangText>
      )}
      <div className="j-idle-clock" dir="ltr">
        {time}
      </div>
      {prayers.length > 0 && (
        <div className="j-prayers">
          {prayers.map((k) => (
            <div className="j-prayer" key={k}>
              <span className="j-prayer-label">{t(`display.prayerTimes.${k}`)}</span>
              <span className="j-prayer-time" dir="ltr">
                {tenant.prayerTimes?.[k]}
              </span>
            </div>
          ))}
        </div>
      )}
      {qrUrl && (
        <div className="j-qr">
          <QrCode value={qrUrl} />
          <div className="j-qr-caption">
            <LangText lang="ar">{t('display.scanQr', { lng: 'ar' })}</LangText>
            <LangText lang="en" style={{ opacity: 0.8, fontSize: '0.85em' }}>
              {t('display.scanQr', { lng: 'en' })}
            </LangText>
          </div>
        </div>
      )}
      {!compact && (
        <div className="j-idle-waiting">
          <LangText lang="ar" as="span">
            {phrase('waiting', 'ar')}
          </LangText>
          {extra.map((l) => (
            <span key={l}>
              <span style={{ opacity: 0.4 }}> · </span>
              <LangText lang={l} as="span">
                {phrase('waiting', l)}
              </LangText>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
