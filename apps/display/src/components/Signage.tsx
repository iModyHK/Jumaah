import { useEffect, useMemo, useState } from 'react';
import { toHijri, type TenantPublicSignage } from '@jumaah/shared';
import { LangText, useNow } from '@jumaah/ui';

/** Hijri and Gregorian date for the mosque's timezone, shown under the clock between khutbahs. */
export function DateLine({ offsetMs, timeZone, locale }: { offsetMs: number; timeZone: string; locale: 'ar' | 'en' }) {
  const now = useNow(60_000, true, offsetMs);
  const text = useMemo(() => {
    const d = new Date(now);
    const hijri = toHijri(d).formatted;
    let greg: string;
    try {
      greg = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    } catch {
      greg = d.toDateString();
    }
    return { hijri, greg };
  }, [now, timeZone, locale]);
  return (
    <div className="j-idle-date">
      <LangText lang="ar" as="span">
        {text.hijri}
      </LangText>
      <span className="j-idle-date-sep"> · </span>
      <LangText lang={locale} as="span">
        {text.greg}
      </LangText>
    </div>
  );
}

const ROTATE_MS = 9000;

/** Announcements between khutbahs: one at a time, both languages, rotating every few seconds. */
export function Announcements({ items, compact = false }: { items: TenantPublicSignage['announcements']; compact?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (items.length <= 1) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [items]);
  if (items.length === 0) return null;
  const a = items[Math.min(i, items.length - 1)];
  return (
    <div className={`j-announce ${compact ? 'j-announce-compact' : ''}`} key={a.id}>
      {a.textAr && (
        <LangText lang="ar" as="div" className="j-announce-ar">
          {a.textAr}
        </LangText>
      )}
      {a.textEn && (
        <LangText lang="en" as="div" className="j-announce-en">
          {a.textEn}
        </LangText>
      )}
      {items.length > 1 && (
        <div className="j-announce-dots" aria-hidden="true">
          {items.map((x, n) => (
            <span key={x.id} data-on={n === i} />
          ))}
        </div>
      )}
    </div>
  );
}
