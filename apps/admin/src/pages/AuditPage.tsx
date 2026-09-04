import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { AuditLogDto, Paginated } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { TextInput } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { fmtDateTime } from '../lib/format';

const PAGE_SIZE = 30;

export function AuditPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['audit', tenantId, { entity, action, page }],
    queryFn: () => api.get<Paginated<AuditLogDto>>('/audit', { entity, action, page, pageSize: PAGE_SIZE }),
  });

  return (
    <div>
      <PageHeader title={t('audit.title')} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:max-w-lg">
        <TextInput
          placeholder={t('audit.entity')}
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
        />
        <TextInput
          placeholder={t('audit.action')}
          value={action}
          dir="ltr"
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className="j-card overflow-x-auto">
        <table className="j-table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('audit.user')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.entity')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.isLoading && (
              <tr>
                <td colSpan={5} className="py-8 text-center">
                  <Spinner />
                </td>
              </tr>
            )}
            {!list.isLoading && (list.data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="j-muted py-8 text-center">
                  {t('common.noResults')}
                </td>
              </tr>
            )}
            {list.data?.items.map((r) => (
              <Row key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
      </div>
    </div>
  );
}

function Row({ row, open, onToggle }: { row: AuditLogDto; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const hasDetails = row.before != null || row.after != null;
  return (
    <>
      <tr>
        <td className="whitespace-nowrap text-xs">{fmtDateTime(row.createdAt)}</td>
        <td className="text-xs" dir="ltr">
          {row.userEmail ?? <span className="j-muted">—</span>}
        </td>
        <td>
          <code className="j-kbd">{row.action}</code>
        </td>
        <td className="text-xs">
          {row.entity}
          {row.entityId && <span className="j-muted"> · {row.entityId.slice(0, 8)}</span>}
        </td>
        <td className="text-end">
          {hasDetails && (
            <Button className="px-2 py-1 text-xs" onClick={onToggle}>
              {open ? t('common.close') : t('audit.details')}
            </Button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--j-bg)' }}>
            <div className="grid gap-3 md:grid-cols-2">
              <JsonBlock title={t('audit.before')} value={row.before} />
              <JsonBlock title={t('audit.after')} value={row.after} />
            </div>
            {row.ip && (
              <div className="j-muted mt-2 text-xs" dir="ltr">
                IP: {row.ip}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="j-label">{title}</div>
      <pre className="j-kbd max-h-64 overflow-auto whitespace-pre-wrap p-2 text-xs" dir="ltr">
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
