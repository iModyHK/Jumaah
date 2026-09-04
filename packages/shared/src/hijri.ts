/** Hijri date helpers based on Intl (Umm al-Qura calendar), no external deps. */
export interface HijriDate {
  year: number;
  month: number;
  day: number;
  formatted: string;
}

export const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

export function toHijri(date: Date): HijriDate {
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { year, month, day, formatted: `${day} ${HIJRI_MONTHS_AR[month - 1] ?? month} ${year}هـ` };
}

/** Next Friday (or today if Friday) at local midnight. */
export function nextFriday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (5 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}
