import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NetworkStatusDto } from '@jumaah/cloud-shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '@jumaah/admin';
import { useAuth } from '@jumaah/admin';
import { Checkbox } from '@jumaah/admin';
import { Card } from '@jumaah/admin';
import { useToast } from '@jumaah/admin';

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
      <div className="j-muted text-xs">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/** Shared translation network: reuse other mosques' approved translations, and share your own. */
export function NetworkCard() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['network', tenantId], queryFn: () => api.get<NetworkStatusDto>('/network') });
  const done = (data: NetworkStatusDto) => {
    toast.success(t('common.success'));
    qc.setQueryData(['network', tenantId], data);
  };
  const save = useMutation({ mutationFn: (body: { read?: boolean; publish?: boolean }) => api.put<NetworkStatusDto>('/network', body), onSuccess: done, onError: (e) => toast.error(e) });
  const publishAll = useMutation({ mutationFn: () => api.post<NetworkStatusDto & { published: number }>('/network/publish-all'), onSuccess: done, onError: (e) => toast.error(e) });
  const s = status.data;

  return (
    <Card title={t('network.title')}>
      <div className="j-muted mb-3 text-sm">{t('network.hint')}</div>
      {status.isLoading && <Spinner />}
      {s && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Checkbox label={t('network.read')} checked={s.read && s.allowed.read} disabled={!s.allowed.read || save.isPending} onChange={(v) => save.mutate({ read: v })} />
            {!s.allowed.read && <div className="j-muted text-xs">{t('branding.locked', { plan: t(`tenants.plans.${s.plan}`) })}</div>}
            <Checkbox label={t('network.publish')} checked={s.publish && s.allowed.publish} disabled={!s.allowed.publish || save.isPending} onChange={(v) => save.mutate({ publish: v })} />
            <div className="j-muted text-xs">{s.allowed.publish ? t('network.publishHint') : t('branding.locked', { plan: t(`tenants.plans.${s.plan}`) })}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Mini label={t('network.published')} value={s.published} />
            <Mini label={t('network.reused')} value={s.reused} />
            <Mini label={t('network.pool')} value={s.pool} />
          </div>
          {s.effective.publish && (
            <div>
              <Button onClick={() => publishAll.mutate()} disabled={publishAll.isPending}>
                {publishAll.isPending ? <Spinner /> : t('network.publishAll')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
