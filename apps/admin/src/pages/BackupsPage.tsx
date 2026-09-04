import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BackupDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { Field, TextInput } from '../components/Field';
import { FileDrop } from '../components/FileDrop';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fmtBytes, fmtDateTime } from '../lib/format';

export function BackupsPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [note, setNote] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupDto | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['backups', tenantId], queryFn: () => api.get<BackupDto[]>('/backups') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['backups'] });

  const create = useMutation({
    mutationFn: () => api.post<BackupDto>('/backups', { note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('common.success'));
      setCreateOpen(false);
      setNote('');
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const restore = async (id: string) => {
    try {
      await api.post(`/backups/${id}/restore`);
      toast.success(t('backup.restored'));
      qc.clear();
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  const restoreUpload = async (file: File) => {
    try {
      await api.upload('/backups/restore-upload', file);
      toast.success(t('backup.restored'));
      qc.clear();
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };

  const download = async (b: BackupDto) => {
    setDownloading(b.id);
    try {
      const res = await api.request<Response>(`/backups/${b.id}/download`, { method: 'GET', raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = b.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast.error(err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('backup.title')}
        actions={
          <>
            <FileDrop accept=".gz,.json,.gzip" label={t('backup.restoreFromFile')} onFile={(f) => setUploadFile(f)} />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t('backup.create')}
            </Button>
          </>
        }
      />
      <DataTable<BackupDto>
        loading={list.isLoading}
        rows={list.data ?? []}
        rowKey={(b) => b.id}
        empty={t('backup.noBackups')}
        columns={[
          { key: 'date', header: t('common.date'), render: (b) => fmtDateTime(b.createdAt) },
          { key: 'file', header: t('common.name'), render: (b) => <code className="j-kbd">{b.filename}</code> },
          { key: 'size', header: t('backup.size'), render: (b) => fmtBytes(b.sizeBytes) },
          { key: 'note', header: t('backup.note'), render: (b) => b.note ?? <span className="j-muted">—</span> },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-end',
            render: (b) => (
              <div className="flex justify-end gap-1">
                <Button className="px-2 py-1 text-xs" onClick={() => void download(b)} disabled={downloading === b.id}>
                  {downloading === b.id ? <Spinner /> : t('common.download')}
                </Button>
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setRestoreTarget(b)}>
                  {t('backup.restore')}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('backup.create')}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <Spinner /> : t('common.create')}
            </Button>
          </>
        }
      >
        <Field label={t('backup.note')} hint={t('common.optional')}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} danger title={t('backup.restore')} message={t('backup.restoreConfirm')} onConfirm={() => (restoreTarget ? restore(restoreTarget.id) : undefined)} />
      <ConfirmDialog
        open={!!uploadFile}
        onClose={() => setUploadFile(null)}
        danger
        title={t('backup.restoreFromFile')}
        message={
          <>
            <div className="mb-2">
              <code className="j-kbd">{uploadFile?.name}</code>
            </div>
            {t('backup.restoreConfirm')}
          </>
        }
        onConfirm={() => (uploadFile ? restoreUpload(uploadFile) : undefined)}
      />
    </div>
  );
}
