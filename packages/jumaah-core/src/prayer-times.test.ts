import { describe, expect, it } from 'vitest';
import { computePrayerTimes, isFriday, localDateParts } from './prayer-times.js';

const riyadh = { lat: 24.7136, lng: 46.6753, method: 'UmmAlQura' as const };
const tz = 'Asia/Riyadh';

describe('localDateParts / isFriday', () => {
  it('reads the calendar day in the mosque timezone', () => {
    // 21:30 UTC on Thursday 3 Sep 2026 is already Friday 00:30 in Riyadh (UTC+3)
    const late = new Date('2026-09-03T21:30:00Z');
    expect(localDateParts(late, tz)).toMatchObject({ year: 2026, month: 9, day: 4, weekday: 5 });
    expect(isFriday(late, tz)).toBe(true);
    expect(isFriday(late, 'America/New_York')).toBe(false);
  });
});

describe('computePrayerTimes', () => {
  it('gives plausible Riyadh times in order', () => {
    const t = computePrayerTimes(riyadh, tz, new Date('2026-09-05T10:00:00Z'))!;
    expect(t).not.toBeNull();
    const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    expect(m(t.fajr)).toBeGreaterThan(3 * 60);
    expect(m(t.fajr)).toBeLessThan(m(t.dhuhr));
    expect(m(t.dhuhr)).toBeGreaterThan(11 * 60);
    expect(m(t.dhuhr)).toBeLessThan(m(t.asr));
    expect(m(t.asr)).toBeLessThan(m(t.maghrib));
    expect(m(t.maghrib)).toBeLessThan(m(t.isha));
    expect(m(t.isha)).toBeLessThan(21 * 60);
  });
  it('Hanafi asr is later than Shafi asr', () => {
    const shafi = computePrayerTimes(riyadh, tz, new Date('2026-09-05T10:00:00Z'))!;
    const hanafi = computePrayerTimes({ ...riyadh, madhab: 'Hanafi' }, tz, new Date('2026-09-05T10:00:00Z'))!;
    expect(hanafi.asr > shafi.asr).toBe(true);
  });
  it('applies minute adjustments and rejects bad coordinates', () => {
    const base = computePrayerTimes(riyadh, tz, new Date('2026-09-05T10:00:00Z'))!;
    const adj = computePrayerTimes({ ...riyadh, adjustments: { fajr: 5 } }, tz, new Date('2026-09-05T10:00:00Z'))!;
    const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    expect(m(adj.fajr) - m(base.fajr)).toBe(5);
    expect(computePrayerTimes({ lat: 95, lng: 0, method: 'UmmAlQura' }, tz)).toBeNull();
  });
});
