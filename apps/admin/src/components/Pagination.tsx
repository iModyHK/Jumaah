import { useTranslation } from 'react-i18next';
import { Button } from '@jumaah/ui';

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="j-muted">{t('common.page', { page, pages, total })}</span>
      <div className="flex gap-2">
        <Button className="px-3 py-1" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          {t('common.previous')}
        </Button>
        <Button className="px-3 py-1" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
