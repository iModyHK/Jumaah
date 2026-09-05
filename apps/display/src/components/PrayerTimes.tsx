import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computePrayerTimes, isFriday, type TenantPublicInfo } from '@jumaah/shared';
import { useNow } from '@jumaah/ui';

const FIVE = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/**
 * Today's prayer times: computed from the mosque's location when set, else the manual times. Jumu'ah is always the
 * manual time and appears on Friday only; during the week the screen is a plain prayer-times and announcements board.
 */
export function useTodayPrayerTimes(tenant: TenantPublicInfo, offsetMs: number): { times: Array<[string, string]>; friday: boolean } {
  const now = useNow(60_000, true, offsetMs);
  return useMemo(() => {
    const d = new Date(now);
    const friday = isFriday(d, tenant.timezone);
    const manual = tenant.prayerTimes ?? {};
    const computed = tenant.prayerLocation ? computePrayerTimes(tenant.prayerLocation, tenant.timezone, d) : null;
    const times: Array<[string, string]> = [];
    for (const k of FIVE) {
      const v = computed?.[k] ?? manual[k];
      if (v) times.push([k, v]);
    }
    if (friday && manual.jumuah) times.push(['jumuah', manual.jumuah]);
    return { times, friday };
  }, [now, tenant.timezone, tenant.prayerTimes, tenant.prayerLocation]);
}

export function PrayerTimesRow({ tenant, offsetMs }: { tenant: TenantPublicInfo; offsetMs: number }) {
  const { t } = useTranslation();
  const { times } = useTodayPrayerTimes(tenant, offsetMs);
  if (times.length === 0) return null;
  return (
    <div className="j-prayers">
      {times.map(([k, v]) => (
        <div className="j-prayer" key={k}>
          <span className="j-prayer-label">{t(`display.prayerTimes.${k}`)}</span>
          <span className="j-prayer-time" dir="ltr">
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}
