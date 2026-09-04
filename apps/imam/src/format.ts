import { toHijri } from '@jumaah/shared';

export function formatGregorian(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium' }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function hijriOf(k: { hijriDate: string | null; gregorianDate: string }): string {
  if (k.hijriDate) return k.hijriDate;
  try {
    const d = new Date(k.gregorianDate);
    return Number.isNaN(d.getTime()) ? '' : toHijri(d).formatted;
  } catch {
    return '';
  }
}
