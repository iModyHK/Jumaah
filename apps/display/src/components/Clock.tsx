import { useMemo } from 'react';
import { useNow } from '@jumaah/ui';

function formatter(timeZone: string | undefined, withSeconds: boolean): Intl.DateTimeFormat {
  const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false, ...(withSeconds ? { second: '2-digit' } : {}) };
  try {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-GB', opts);
  }
}

/** HH:MM using the server clock offset, in the mosque's timezone. */
export function useClock(offsetMs: number, timeZone?: string, withSeconds = false): string {
  const now = useNow(1000, true, offsetMs);
  const fmt = useMemo(() => formatter(timeZone, withSeconds), [timeZone, withSeconds]);
  return fmt.format(new Date(now));
}

export function Clock({ offsetMs, timeZone, className = '' }: { offsetMs: number; timeZone?: string; className?: string }) {
  const text = useClock(offsetMs, timeZone);
  return (
    <span className={className} dir="ltr">
      {text}
    </span>
  );
}
