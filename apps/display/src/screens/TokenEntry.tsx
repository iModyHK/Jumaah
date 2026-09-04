import { useState, type FormEvent } from 'react';
import { Button } from '@jumaah/ui';
import { screenUrl } from '../routes';
import { useTheme } from '../kiosk';

/** Extract a token from a pasted display URL, or return the raw value. */
function extractToken(raw: string): string {
  const v = raw.trim();
  const m = v.match(/\/display\/(?!m\/)([^/?#\s]+)/);
  return m ? m[1] : v.replace(/^\/+/, '');
}

export function TokenEntry() {
  useTheme('dark');
  const [value, setValue] = useState('');
  const token = extractToken(value);

  const go = (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    window.location.assign(screenUrl(token));
  };

  return (
    <div className="j-center" style={{ color: 'var(--j-fg)' }}>
      <form onSubmit={go} className="j-card flex w-full max-w-md flex-col gap-4 p-6" dir="rtl">
        <div>
          <div className="text-2xl font-bold" lang="ar">
            شاشة جُمعة
          </div>
          <div className="text-sm" style={{ color: 'var(--j-fg-muted)' }} lang="en" dir="ltr">
            Jumaah Display
          </div>
        </div>
        <label className="flex flex-col gap-2 text-start text-sm">
          <span lang="ar">
            رمز الشاشة <span style={{ color: 'var(--j-fg-muted)' }}>/ Display token</span>
          </span>
          <input className="j-input" dir="ltr" autoFocus autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder="xxxxxxxx" />
        </label>
        <Button variant="primary" type="submit" disabled={!token}>
          <span lang="ar">فتح الشاشة</span>
          <span style={{ opacity: 0.7 }}>· Open</span>
        </Button>
      </form>
    </div>
  );
}
