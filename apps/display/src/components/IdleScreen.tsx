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

  const announcements = tenant.signage?.announcements?.length ? tenant.signage.announcements : null;
  const hasSide = !compact && !!(announcements || qrUrl);

  const head = (
    <div className="j-idle-head">
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
    </div>
  );
  const main = (
    <div className="j-idle-main">
      <div className="j-idle-clock" dir="ltr">
        {time}
      </div>
      {tenant.signage?.showDate && <DateLine offsetMs={offsetMs} timeZone={tenant.timezone} locale={tenant.locale} />}
    </div>
  );
  const announce = announcements ? (
    <div className="j-idle-ann">
      <Announcements items={announcements} compact={compact} />
    </div>
  ) : null;
  const qr = qrUrl && (
    <div className="j-qr">
      <QrCode value={qrUrl} />
      <div className="j-qr-caption">
        <LangText lang="ar">{t('display.scanQr', { lng: 'ar' })}</LangText>
        <LangText lang="en" style={{ opacity: 0.8, fontSize: '0.85em' }}>
          {t('display.scanQr', { lng: 'en' })}
        </LangText>
      </div>
    </div>
  );
  const foot = (
    <div className="j-idle-foot">
      <PrayerTimesRow tenant={tenant} offsetMs={offsetMs} />
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
    </div>
  );

  // Phones scroll a single column. Wall screens are a fixed box: on a wide (16:9) screen the announcement sits
  // beside the clock and the QR beside the prayer times, and FitBox shrinks the board only if it still does not
  // fit (a tall 4:3 screen, or a very long welcome).
  if (compact) {
    return (
      <div className="j-idle j-fade-in">
        {head}
        {main}
        {announce}
        {foot}
        {qr}
      </div>
    );
  }
  return (
    <FitBox className="j-idle j-fade-in" innerClassName="j-idle-fit" innerProps={{ 'data-side': hasSide || undefined }}>
      {head}
      {main}
      {announce}
      {foot}
      {qr}
    </FitBox>
  );
}
