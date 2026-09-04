import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { KhutbahDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/format';
import { useInvalidateKhutbah } from './hooks';

interface VersionRow {
  id: string;
  version: number;
  changeNote: string | null;
  createdById: string | null;
  createdAt: string;
}

export function VersionsModal({ khutbahId, open, onClose, canEdit }: { khutbahId: string; open: boolean; onClose: () => void; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const [restoreTarget, setRestoreTarget] = useState<VersionRow | null>(null);
  const versions = useQuery({ queryKey: ['khutbah', khutbahId, 'versions'], queryFn: () => api.get<VersionRow[]>(`/khutbahs/${khutbahId}/versions`), enabled: open });

  const restore = useMutation({
    mutationFn: (v: number) => api.post<KhutbahDto>(`/khutbahs/${khutbahId}/versions/${v}/restore`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
      void versions.refetch();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title={t('khutbah.versions')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
        {versions.isLoading && <Spinner />}
        {versions.data && versions.data.length === 0 && <div className="j-muted text-sm">{t('khutbah.noVersions')}</div>}
        <div className="flex flex-col gap-2">
          {versions.data?.map((v) => (
            <div key={v.id} className="j-card flex items-center gap-3 p-3">
              <span className="font-bold tabular-nums">v{v.version}</span>
              <div className="flex-1">
                <div className="text-sm">{v.changeNote ?? '—'}</div>
                <div className="j-muted text-xs">{fmtDateTime(v.createdAt)}</div>
              </div>
              {canEdit && (
                <Button className="px-2 py-1 text-xs" onClick={() => setRestoreTarget(v)} disabled={restore.isPending}>
                  {t('khutbah.restoreVersion')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title={t('khutbah.restoreVersion')}
        message={t('khutbah.restoreConfirm', { version: restoreTarget?.version ?? '' })}
        onConfirm={() => (restoreTarget ? restore.mutateAsync(restoreTarget.version).then(() => undefined) : undefined)}
      />
    </>
  );
}
