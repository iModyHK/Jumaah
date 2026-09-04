import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KHUTBAH_STATUSES, copyKhutbahSchema, type KhutbahDto, type Paginated } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { DataTable } from '../components/DataTable';
import { Checkbox, Field, Select, TextInput } from '../components/Field';
import { LangNames } from '../components/LanguagePicker';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { KhutbahStatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { fmtDate } from '../lib/format';
import { validate, clean } from '../lib/forms';

const PAGE_SIZE = 20;

export function KhutbahsPage() {
  const { t } = useTranslation();
  const { tenantId, canEdit } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [copyTarget, setCopyTarget] = useState<KhutbahDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KhutbahDto | null>(null);

  const list = useQuery({
    queryKey: ['khutbahs', tenantId, { q, status, from, to, page }],
    queryFn: () => api.get<Paginated<KhutbahDto>>('/khutbahs', { q, status, from, to, page, pageSize: PAGE_SIZE }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/khutbahs/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['khutbahs'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <div>
      <PageHeader
        title={t('khutbah.list')}
        actions={
          canEdit && (
            <Link to="/khutbahs/new" className="j-btn j-btn-primary">
              {t('khutbah.new')}
            </Link>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <TextInput
          placeholder={t('common.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t('common.status')}: {t('common.all')}</option>
          {KHUTBAH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`khutbah.status.${s}`)}
            </option>
          ))}
        </Select>
        <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} title={t('common.from')} />
        <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} title={t('common.to')} />
      </div>

      <DataTable<KhutbahDto>
        loading={list.isLoading}
        rows={list.data?.items ?? []}
        rowKey={(k) => k.id}
        onRowClick={(k) => navigate(`/khutbahs/${k.id}`)}
        columns={[
          {
            key: 'title',
            header: t('khutbah.title'),
            render: (k) => (
              <div>
                <div className="font-semibold">{k.title}</div>
                {k.imamName && <div className="j-muted text-xs">{k.imamName}</div>}
              </div>
            ),
          },
          {
            key: 'date',
            header: t('common.date'),
            render: (k) => (
              <div>
                <div>{fmtDate(k.gregorianDate)}</div>
                {k.hijriDate && <div className="j-muted text-xs">{k.hijriDate}</div>}
              </div>
            ),
          },
          { key: 'status', header: t('common.status'), render: (k) => <KhutbahStatusBadge status={k.status} /> },
          { key: 'langs', header: t('khutbah.targetLanguages'), render: (k) => <LangNames codes={k.targetLanguages} /> },
          {
            key: 'stats',
            header: t('khutbah.paragraphs'),
            render: (k) => <span className="tabular-nums">{k.stats?.paragraphs ?? '—'}</span>,
          },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-end',
            render: (k) => (
              <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                <Link to={`/khutbahs/${k.id}`} className="j-btn px-2 py-1 text-xs">
                  {t('common.open')}
                </Link>
                {canEdit && (
                  <>
                    <Button className="px-2 py-1 text-xs" onClick={() => setCopyTarget(k)}>
                      {t('common.copy')}
                    </Button>
                    <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(k)}>
                      {t('common.delete')}
                    </Button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <div className="mt-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
      </div>

      <CopyKhutbahModal khutbah={copyTarget} onClose={() => setCopyTarget(null)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('khutbah.deleteConfirm')} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
    </div>
  );
}

export function CopyKhutbahModal({ khutbah, onClose }: { khutbah: KhutbahDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [includeTranslations, setInclude] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);

  if (khutbah && key !== khutbah.id) {
    setKey(khutbah.id);
    setTitle(t('khutbah.copyTitle', { title: khutbah.title }));
    setDate('');
    setInclude(true);
    setErrors({});
  }

  const copy = useMutation({
    mutationFn: (body: unknown) => api.post<KhutbahDto>(`/khutbahs/${khutbah!.id}/copy`, body),
    onSuccess: (k) => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['khutbahs'] });
      onClose();
      navigate(`/khutbahs/${k.id}`);
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const v = validate(copyKhutbahSchema, clean({ title: title.trim(), gregorianDate: date, includeTranslations }));
    setErrors(v.errors);
    if (v.ok) copy.mutate(v.data);
  };

  return (
    <Modal
      open={!!khutbah}
      onClose={onClose}
      title={t('khutbah.copy')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={copy.isPending}>
            {copy.isPending ? <Spinner /> : t('common.copy')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('khutbah.title')} error={errors.title}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('khutbah.gregorianDate')} error={errors.gregorianDate} hint={t('common.optional')}>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Checkbox label={t('khutbah.includeTranslations')} checked={includeTranslations} onChange={setInclude} />
      </div>
    </Modal>
  );
}
