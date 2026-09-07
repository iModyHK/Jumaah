/**
 * Daily prayer times from the mosque's coordinates (adhan library), so screens stay right all year without anyone
 * typing times. Jumu'ah is not astronomical and stays a manual setting.
 */
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';

export const PRAYER_METHODS = ['UmmAlQura', 'MuslimWorldLeague', 'Egyptian', 'Karachi', 'Dubai', 'Kuwait', 'Qatar', 'MoonsightingCommittee', 'NorthAmerica', 'Singapore', 'Turkey', 'Tehran'] as const;
export type PrayerMethod = (typeof PRAYER_METHODS)[number];

export interface PrayerLocation {
  lat: number;
  lng: number;
  method: PrayerMethod;
  /** Asr shadow rule; Hanafi is later. */
  madhab?: 'Shafi' | 'Hanafi';
  /** Minute adjustments per prayer, e.g. { fajr: -2 }. */
  adjustments?: Partial<Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', number>>;
}

export type DailyPrayerTimes = Record<'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', string>;

/** Year, month (1-12), day and weekday (0 = Sunday) of `now` in the given IANA timezone. */
export function localDateParts(now: Date, timeZone: string): { year: number; month: number; day: number; weekday: number } {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  }
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday };
}

export function isFriday(now: Date, timeZone: string): boolean {
  return localDateParts(now, timeZone).weekday === 5;
}

function formatHm(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  }
}

/** Today's five prayer times as HH:MM in the mosque's timezone, or null when the location is unusable. */
export function computePrayerTimes(location: PrayerLocation, timeZone: string, now: Date = new Date()): DailyPrayerTimes | null {
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return null;
  const method = (CalculationMethod as unknown as Record<string, () => ReturnType<typeof CalculationMethod.UmmAlQura>>)[location.method] ?? CalculationMethod.UmmAlQura;
  const params = method();
  params.madhab = location.madhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const adj = location.adjustments ?? {};
  params.adjustments = { fajr: adj.fajr ?? 0, sunrise: 0, dhuhr: adj.dhuhr ?? 0, asr: adj.asr ?? 0, maghrib: adj.maghrib ?? 0, isha: adj.isha ?? 0 };
  const { year, month, day } = localDateParts(now, timeZone);
  // adhan reads the calendar day from the Date's local components; noon avoids any DST edge.
  const times = new PrayerTimes(new Coordinates(location.lat, location.lng), new Date(year, month - 1, day, 12), params);
  return { fajr: formatHm(times.fajr, timeZone), dhuhr: formatHm(times.dhuhr, timeZone), asr: formatHm(times.asr, timeZone), maghrib: formatHm(times.maghrib, timeZone), isha: formatHm(times.isha, timeZone) };
}
