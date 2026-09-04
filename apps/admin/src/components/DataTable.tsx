import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@jumaah/ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="j-card overflow-x-auto">
      <table className="j-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="py-8 text-center">
                <Spinner />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="j-muted py-8 text-center">
                {empty ?? t('common.noResults')}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} style={onRowClick ? { cursor: 'pointer' } : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
