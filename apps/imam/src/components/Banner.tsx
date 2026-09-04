import type { ReactNode } from 'react';

const TONES = {
  warn: { background: 'var(--j-warn)', color: '#1a1200' },
  accent: { background: 'var(--j-accent)', color: '#06120c' },
  muted: { background: 'var(--j-bg-soft)', color: 'var(--j-fg)' },
  danger: { background: 'var(--j-danger)', color: '#fff' },
} as const;

export function Banner({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <div className="j-fade-in px-4 py-2 text-center text-base font-bold" style={TONES[tone]} role="status">
      {children}
    </div>
  );
}
