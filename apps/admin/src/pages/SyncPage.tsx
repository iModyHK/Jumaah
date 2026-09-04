import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncStatusDto } from '@jumaah/shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Card, PageHeader, Stat } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fmtDateTime } from '../lib/format';

export function SyncPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['sync', tenantId], queryFn: () => api.get<SyncStatusDto>('/sync/status'), refetchInterval: 15_000 });
  const syncNow = useMutation({
    mutationFn: () => api.post('/sync/now'),
    onSuccess: () => {
      toast.success(t('sync.triggered'));
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['sync'] }), 2000);
    },
    onError: (e) => toast.error(e),
  });

  const s = status.data;
  const updateAvailable = !!s?.latestImageTag && s.latestImageTag !== s.imageTag;

  return (
    <div>
      <PageHeader
        title={t('sync.title')}
        actions={
          <>
            <Button onClick={() => void status.refetch()}>{t('common.refresh')}</Button>
            <Button variant="primary" onClick={() => syncNow.mutate()} disabled={syncNow.isPending || !s}>
              {syncNow.isPending ? <Spinner /> : t('sync.syncNow')}
            </Button>
          </>
        }
      />
      {status.isLoading && <Spinner />}
      {s && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label={t('sync.mode')} value={t(`sync.${s.mode}`)} hint={s.cloudUrl ?? undefined} />
            <Stat label={t('common.status')} value={<StatusPill tone={s.online ? 'ok' : 'danger'}>{s.online ? t('sync.online') : t('sync.offline')}</StatusPill>} />
            <Stat label={t('sync.pending')} value={s.pendingOutbox} />
            <Stat
              label={t('sync.imageTag')}
              value={<code className="j-kbd">{s.imageTag}</code>}
              hint={
                updateAvailable ? (
                  <span style={{ color: 'var(--j-warn)' }}>
                    {t('sync.updateAvailable')}: {s.latestImageTag}
                  </span>
                ) : s.latestImageTag ? (
                  `${t('sync.latestImageTag')}: ${s.latestImageTag}`
                ) : undefined
              }
            />
          </div>
          <Card>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="j-muted text-xs">{t('sync.lastPush')}</dt>
                <dd>{fmtDateTime(s.lastPushAt)}</dd>
              </div>
              <div>
                <dt className="j-muted text-xs">{t('sync.lastPull')}</dt>
                <dd>{fmtDateTime(s.lastPullAt)}</dd>
              </div>
              <div>
                <dt className="j-muted text-xs">{t('sync.cloudUrl')}</dt>
                <dd dir="ltr">{s.cloudUrl ?? '—'}</dd>
              </div>
              <div>
                <dt className="j-muted text-xs">{t('sync.lastError')}</dt>
                <dd style={{ color: s.lastError ? 'var(--j-danger)' : undefined }} dir="ltr">
                  {s.lastError ?? '—'}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}
