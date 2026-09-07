import { useEffect, type CSSProperties, type ReactNode } from 'react';
import type { TenantPublicBranding } from '@jumaah/core';

const NEUTRAL: TenantPublicBranding = { logoUrl: null, primary: null, accent: null, css: null, hideMark: false };

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.round(v + (255 - v) * amount));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/** CSS variables that carry the mosque's colours over the chosen theme. Nothing is set when the plan gives none. */
export function brandingStyle(b: TenantPublicBranding | undefined): CSSProperties {
  const s: Record<string, string> = {};
  if (b?.primary) {
    s['--j-accent'] = b.primary;
    s['--j-accent-soft'] = rgba(b.primary, 0.2);
  }
  if (b?.accent) {
    s['--j-bg'] = b.accent;
    s['--j-bg-soft'] = lighten(b.accent, 0.08);
  }
  return s as CSSProperties;
}

/** Injects the mosque's custom CSS (Pro) into the page while mounted. */
export function useBrandingCss(css: string | null | undefined): void {
  useEffect(() => {
    if (!css) return;
    const el = document.createElement('style');
    el.id = 'j-brand-css';
    el.textContent = css;
    document.head.appendChild(el);
    return () => el.remove();
  }, [css]);
}

/** The small Jumaah mark on screens and the phone page. Hidden on plans that include branding removal. */
export function JumaahMark({ branding, className = '' }: { branding: TenantPublicBranding | undefined; className?: string }) {
  if (branding?.hideMark) return null;
  return (
    <span className={`j-brandmark ${className}`} dir="ltr" aria-label="Jumaah">
      <svg viewBox="0 0 100 100" width="14" height="14" aria-hidden="true">
        <polygon fill="currentColor" points="96,50 82.5,63.5 82.5,82.5 63.5,82.5 50,96 36.5,82.5 17.5,82.5 17.5,63.5 4,50 17.5,36.5 17.5,17.5 36.5,17.5 50,4 63.5,17.5 82.5,17.5 82.5,36.5" />
      </svg>
      <span>Jumaah</span>
    </span>
  );
}

export function brandingOf(b: TenantPublicBranding | undefined): TenantPublicBranding {
  return b ?? NEUTRAL;
}

export function Branded({ branding, className, children }: { branding: TenantPublicBranding | undefined; className: string; children: ReactNode }) {
  useBrandingCss(branding?.css);
  return (
    <div className={className} style={brandingStyle(branding)}>
      {children}
    </div>
  );
}
