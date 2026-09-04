import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KhutbahDto, LibraryKhutbahDto, Paginated, TenantDto } from '@jumaah/shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, TextInput } from '../components/Field';
import { LangNames } from '../components/LanguagePicker';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { fmtDate, toDateInput } from '../lib/format';
import { nextFriday } from '@jumaah/shared';

const PAGE_SIZE = 24;

export function LibraryPage() {
  const { t } = useTranslation();
  const { tenantId, isSuper, canEdit } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const [importTarget, setImportTarget] = useState<LibraryKhutbahDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibraryKhutbahDto | null>(null);

  const list = useQuery({
    queryKey: ['library', tenantId, { q, pending, page }],
    queryFn: () => api.get<Paginated<LibraryKhutbahDto>>('/library', { q, pending: pending ? '1' : undefined, page, pageSize: PAGE_SIZE }),
  });
  const tenant = useQuery({ queryKey: ['tenant', tenantId], queryFn: () => api.get<TenantDto>('/tenant'), enabled: !!tenantId });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['library'] });

  const approve = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => api.post(`/library/${id}/approve`, { approved }),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/library/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const items = list.data?.items ?? [];
  const canDelete = (item: LibraryKhutbahDto) => isSuper || (canEdit && !!tenant.data && item.sourceTenantName === tenant.data.name);

  return (
    <div>
      <PageHeader title={t('library.title')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-64">
          <TextInput
            placeholder={t('common.search')}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {isSuper && (
          <div className="flex gap-1">
            <button type="button" className="j-chip" data-active={!pending} onClick={() => setPending(false)}>
              {t('common.all')}
            </button>
            <button type="button" className="j-chip" data-active={pending} onClick={() => setPending(true)}>
              {t('library.pendingApproval')}
            </button>
          </div>
        )}
      </div>

      {list.isLoading && <Spinner />}
      {!list.isLoading && items.length === 0 && <EmptyState title={t('library.noItems')} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="j-card flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{item.title}</div>
              {!item.approved && <StatusPill tone="warn">{t('library.pendingApproval')}</StatusPill>}
            </div>
            {item.description && <div className="j-muted text-sm">{item.description}</div>}
            <div className="j-muted text-xs">
              {t('library.source')}: {item.sourceTenantName} · {t('khutbah.paragraphs')}: {item.paragraphCount} · {fmtDate(item.createdAt)}
            </div>
            <LangNames codes={item.languages} />
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="j-chip cursor-default">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-1 pt-2">
              {canEdit && tenantId && (
                <Button variant="primary" className="px-2 py-1 text-xs" onClick={() => setImportTarget(item)}>
                  {t('library.importToMosque')}
                </Button>
              )}
              {isSuper && !item.approved && (
                <Button className="px-2 py-1 text-xs" onClick={() => approve.mutate({ id: item.id, approved: true })}>
                  {t('library.approve')}
                </Button>
              )}
              {isSuper && item.approved && (
                <Button className="px-2 py-1 text-xs" onClick={() => approve.mutate({ id: item.id, approved: false })}>
                  {t('khutbah.reject')}
                </Button>
              )}
              {canDelete(item) && (
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(item)}>
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
      </div>

      <ImportModal item={importTarget} onClose={() => setImportTarget(null)} onImported={(k) => navigate(`/khutbahs/${k.id}`)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('common.areYouSure')} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
    </div>
  );
}

function ImportModal({ item, onClose, onImported }: { item: LibraryKhutbahDto | null; onClose: () => void; onImported: (k: KhutbahDto) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInput(nextFriday()));
  const [key, setKey] = useState<string | null>(null);
  if (item && key !== item.id) {
    setKey(item.id);
    setTitle(item.title);
  }
  const imp = useMutation({
    mutationFn: () => api.post<KhutbahDto>(`/library/${item!.id}/import`, { title: title.trim() || undefined, gregorianDate: date || undefined }),
    onSuccess: (k) => {
      toast.success(t('library.imported'));
      void qc.invalidateQueries({ queryKey: ['khutbahs'] });
      onClose();
      onImported(k);
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={t('library.importToMosque')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => imp.mutate()} disabled={imp.isPending}>
            {imp.isPending ? <Spinner /> : t('common.import')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('khutbah.title')}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('khutbah.gregorianDate')}>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
