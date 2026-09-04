import { useTranslation } from 'react-i18next';
import type { KhutbahStatus } from '@jumaah/shared';

const TONE: Record<KhutbahStatus, string> = {
  READY: 'var(--j-accent)',
  REVIEW: 'var(--j-warn)',
  TRANSLATING: '#7cc4ff',
  DELIVERED: 'var(--j-fg-muted)',
  DRAFT: 'var(--j-fg-muted)',
  ARCHIVED: 'var(--j-fg-muted)',
};

export function StatusBadge({ status }: { status: KhutbahStatus }) {
  const { t } = useTranslation();
  const color = TONE[status] ?? 'var(--j-fg-muted)';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold" style={{ color, border: `1px solid ${color}`, background: 'var(--j-bg)' }}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {t(`khutbah.status.${status}`)}
    </span>
  );
}
