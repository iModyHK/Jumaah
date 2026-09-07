import { useTranslation } from 'react-i18next';
import type { TenantPublicInfo } from '@jumaah/core';
import { LangText } from '@jumaah/ui';
import { phrase } from '../phrases';
import { useClock } from './Clock';
import { FitBox } from './FitBox';
import { PrayerTimesRow, useTodayPrayerTimes } from './PrayerTimes';
import { QrCode } from './QrCode';
import { Announcements, DateLine } from './Signage';

export function IdleScreen({
  tenant,
  logoUrl,
  offsetMs,
  qrUrl,
  languages,
  compact = false,
  expecting = false,
}: {
  tenant: TenantPublicInfo;
  logoUrl: string | null;
  offsetMs: number;
  /** When set, a QR code + caption is rendered (wall screens only). */
  qrUrl: string | null;
  /** Panel languages: a "waiting" phrase is shown in each of them. */
  languages: string[];
  compact?: boolean;
  /** A khutbah is queued for this session, so the screen is genuinely waiting for it (any weekday). */
  expecting?: boolean;
}) {
  const { t } = useTranslation();
  const time = useClock(offsetMs, tenant.timezone);
  const { friday } = useTodayPrayerTimes(tenant, offsetMs);
  const extra = languages.filter((l) => l !== 'ar').slice(0, 4);
  // During the week the screen is a prayer-times and announcements board; the waiting line belongs to Friday.
  const waiting = !compact && (friday || expecting);

  const body = (
    <>
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
      {tenant.signage?.showDate && <DateLine offsetMs={offsetMs} timeZone={tenant.timezone} locale={tenant.locale} />}
      {tenant.signage?.announcements?.length ? <Announcements items={tenant.signage.announcements} compact={compact} /> : null}
      <PrayerTimesRow tenant={tenant} offsetMs={offsetMs} />
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
      {waiting && (
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
    </>
  );
  // Wall screens are a fixed box: the board shrinks to fit it. On a phone the page scrolls instead.
  if (compact) return <div className="j-idle j-fade-in">{body}</div>;
  return (
    <FitBox className="j-idle j-fade-in" innerClassName="j-idle-fit">
      {body}
    </FitBox>
  );
}
