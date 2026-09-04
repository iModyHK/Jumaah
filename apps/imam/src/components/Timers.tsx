import { useTranslation } from 'react-i18next';
import { formatDuration } from '@jumaah/ui';

export function Timers({ elapsed, section, remaining }: { elapsed: number; section: number; remaining: number }) {
  const { t } = useTranslation();
  const cells: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: t('imam.elapsed'), value: formatDuration(elapsed), strong: true },
    { label: t('imam.sectionEnd'), value: formatDuration(section) },
    { label: t('imam.remaining'), value: `≈ ${formatDuration(remaining)}` },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-1" dir="ltr">
      {cells.map((c) => (
        <div key={c.label} className="j-card flex flex-col items-center px-2 py-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--j-fg-muted)' }}>
            {c.label}
          </span>
          <span className="font-mono text-xl font-bold tabular-nums" style={{ color: c.strong ? 'var(--j-accent)' : 'var(--j-fg)' }}>
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}
