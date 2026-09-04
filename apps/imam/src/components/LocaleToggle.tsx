import { useTranslation } from 'react-i18next';
import { setLocale, type UiLocale } from '@jumaah/ui';

const LOCALES: Array<{ code: UiLocale; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
];

export function LocaleToggle({ compact = false }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const current: UiLocale = i18n.language === 'en' ? 'en' : 'ar';
  return (
    <div className="inline-flex overflow-hidden rounded-xl border" style={{ borderColor: 'var(--j-border)' }} role="group" aria-label="language">
      {LOCALES.map((l) => {
        const active = l.code === current;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            onClick={() => setLocale(l.code)}
            className={`${compact ? 'min-h-11 px-3 text-sm' : 'min-h-12 px-5 text-base'} font-semibold`}
            style={{ background: active ? 'var(--j-accent)' : 'transparent', color: active ? '#06120c' : 'var(--j-fg)' }}
            aria-pressed={active}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
