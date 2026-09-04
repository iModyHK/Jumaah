import type { CSSProperties, ReactNode } from 'react';
import { getLanguage } from '@jumaah/shared';

/** Renders text with the right direction, font stack and line-height for its language. */
export function LangText({
  lang,
  children,
  className = '',
  style,
  as: Tag = 'div',
}: {
  lang: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'p' | 'span' | 'h1' | 'h2';
}) {
  const info = getLanguage(lang);
  return (
    <Tag lang={lang} dir={info.dir} className={`j-lang ${className}`} style={{ fontFamily: info.fontFamily, lineHeight: info.lineHeight, textAlign: info.dir === 'rtl' ? 'right' : 'left', ...style }}>
      {children}
    </Tag>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`j-spinner inline-block ${className}`} aria-label="loading" />;
}

export function Button({
  variant = 'default',
  className = '',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const v = variant === 'primary' ? 'j-btn-primary' : variant === 'danger' ? 'j-btn-danger' : variant === 'ghost' ? 'j-btn-ghost' : '';
  return (
    <button type="button" className={`j-btn ${v} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function StatusPill({ tone = 'muted', children }: { tone?: 'ok' | 'warn' | 'danger' | 'muted'; children: ReactNode }) {
  const color = tone === 'ok' ? 'var(--j-accent)' : tone === 'warn' ? 'var(--j-warn)' : tone === 'danger' ? 'var(--j-danger)' : 'var(--j-fg-muted)';
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--j-bg)', color, border: `1px solid ${color}` }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function ConnectionDot({ connected, label }: { connected: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" style={{ color: connected ? 'var(--j-accent)' : 'var(--j-warn)' }}>
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: connected ? 'var(--j-accent)' : 'var(--j-warn)', boxShadow: connected ? '0 0 8px var(--j-accent)' : undefined }} />
      {label}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="j-card flex flex-col items-center gap-2 p-10 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {hint && <div style={{ color: 'var(--j-fg-muted)' }}>{hint}</div>}
      {action}
    </div>
  );
}
