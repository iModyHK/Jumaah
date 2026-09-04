import { LANGUAGES, getLanguage } from '@jumaah/shared';

/** Multi-select of languages as toggle chips; keeps click order. */
export function LanguagePicker({
  value,
  onChange,
  options,
  max,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Restrict to a subset of codes (defaults to every known language). */
  options?: string[];
  max?: number;
  disabled?: boolean;
}) {
  const codes = options ?? Object.keys(LANGUAGES);
  const toggle = (code: string) => {
    if (disabled) return;
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else if (!max || value.length < max) onChange([...value, code]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((code) => {
        const info = getLanguage(code);
        const active = value.includes(code);
        const full = !active && !!max && value.length >= max;
        return (
          <button key={code} type="button" className="j-chip" data-active={active} onClick={() => toggle(code)} disabled={disabled || full} style={full ? { opacity: 0.4 } : undefined} title={info.name}>
            <span lang={code} dir={info.dir}>
              {info.nativeName}
            </span>
            <span className="j-muted text-[0.65rem] uppercase">{code}</span>
          </button>
        );
      })}
    </div>
  );
}

export function LangNames({ codes }: { codes: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {codes.map((c) => (
        <span key={c} className="rounded-md px-1.5 py-0.5 text-xs" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }} lang={c} dir={getLanguage(c).dir}>
          {getLanguage(c).nativeName}
        </span>
      ))}
    </span>
  );
}
