import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GLOSSARY_MODES, LANGUAGES, getLanguage, glossaryEntrySchema, type GlossaryDto, type GlossaryMode } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable } from '../components/DataTable';
import { Field, FormRow, Select, TextArea, TextInput } from '../components/Field';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { clean, validate } from '../lib/forms';

interface Draft {
  term: string;
  lang: string;
  replacement: string;
  mode: GlossaryMode;
  note: string;
}
const EMPTY: Draft = { term: '', lang: '*', replacement: '', mode: 'KEEP', note: '' };

export function GlossaryPage() {
  const { t } = useTranslation();
  const { tenantId, canEdit } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GlossaryDto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const list = useQuery({ queryKey: ['glossary', tenantId], queryFn: () => api.get<GlossaryDto[]>('/glossary') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['glossary'] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: unknown }) => (id ? api.patch<GlossaryDto>(`/glossary/${id}`, body) : api.post<GlossaryDto>('/glossary', body)),
    onSuccess: () => {
      toast.success(t('common.success'));
      setEditing(null);
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/glossary/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const rows = (list.data ?? []).filter((g) => !q || g.term.includes(q) || (g.replacement ?? '').toLowerCase().includes(q.toLowerCase()));

  const submit = () => {
    if (!editing) return;
    const v = validate(glossaryEntrySchema, clean({ ...editing.draft, term: editing.draft.term.trim() }));
    setErrors(v.errors);
    if (v.ok) save.mutate({ id: editing.id, body: v.data });
  };

  const langLabel = (code: string) => (code === '*' ? t('glossary.allLanguages') : getLanguage(code).nativeName);
  const update = (patch: Partial<Draft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } });

  return (
    <div>
      <PageHeader
        title={t('glossary.title')}
        subtitle={t('glossary.hint')}
        actions={
          canEdit && (
            <>
              <Button onClick={() => setBulkOpen(true)}>{t('common.import')}</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setErrors({});
                  setEditing({ id: null, draft: EMPTY });
                }}
              >
                {t('glossary.add')}
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 max-w-sm">
        <TextInput placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <DataTable<GlossaryDto>
        loading={list.isLoading}
        rows={rows}
        rowKey={(g) => g.id}
        columns={[
          {
            key: 'term',
            header: t('glossary.term'),
            render: (g) => (
              <span className="font-semibold" lang="ar" dir="rtl">
                {g.term}
              </span>
            ),
          },
          { key: 'lang', header: t('common.language'), render: (g) => langLabel(g.lang) },
          { key: 'mode', header: t('glossary.mode'), render: (g) => t(`glossary.modes.${g.mode}`) },
          { key: 'replacement', header: t('glossary.replacement'), render: (g) => g.replacement ?? <span className="j-muted">—</span> },
          { key: 'note', header: t('glossary.note'), render: (g) => <span className="j-muted text-xs">{g.note ?? ''}</span> },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-end',
            render: (g) =>
              canEdit && (
                <div className="flex justify-end gap-1">
                  <Button
                    className="px-2 py-1 text-xs"
                    onClick={() => {
                      setErrors({});
                      setEditing({ id: g.id, draft: { term: g.term, lang: g.lang, replacement: g.replacement ?? '', mode: g.mode, note: g.note ?? '' } });
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(g)}>
                    {t('common.delete')}
                  </Button>
                </div>
              ),
          },
        ]}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? t('common.edit') : t('glossary.add')}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : t('common.save')}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <Field label={t('glossary.term')} error={errors.term}>
              <TextInput value={editing.draft.term} lang="ar" dir="rtl" onChange={(e) => update({ term: e.target.value })} />
            </Field>
            <FormRow>
              <Field label={t('common.language')} error={errors.lang}>
                <Select value={editing.draft.lang} onChange={(e) => update({ lang: e.target.value })}>
                  <option value="*">{t('glossary.allLanguages')}</option>
                  {Object.values(LANGUAGES).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeName} ({l.code})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('glossary.mode')} error={errors.mode}>
                <Select value={editing.draft.mode} onChange={(e) => update({ mode: e.target.value as GlossaryMode })}>
                  {GLOSSARY_MODES.map((m) => (
                    <option key={m} value={m}>
                      {t(`glossary.modes.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormRow>
            <Field label={t('glossary.replacement')} error={errors.replacement}>
              <TextInput value={editing.draft.replacement} onChange={(e) => update({ replacement: e.target.value })} />
            </Field>
            <Field label={t('glossary.note')} error={errors.note}>
              <TextInput value={editing.draft.note} onChange={(e) => update({ note: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <BulkModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('common.areYouSure')} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
    </div>
  );
}

function BulkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [lang, setLang] = useState('*');
  const [mode, setMode] = useState<GlossaryMode>('REPLACE');

  const entries = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [term, replacement] = l.split('\t').map((s) => s.trim());
      return { term, lang, mode, replacement: replacement || undefined };
    })
    .filter((e) => e.term);

  const bulk = useMutation({
    mutationFn: () => api.post<{ written: number }>('/glossary/bulk', { entries }),
    onSuccess: (r) => {
      toast.success(`${t('common.success')} (${r.written})`);
      setText('');
      onClose();
      void qc.invalidateQueries({ queryKey: ['glossary'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('glossary.bulkTitle')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={entries.length === 0 || bulk.isPending} onClick={() => bulk.mutate()}>
            {bulk.isPending ? <Spinner /> : `${t('common.import')} (${entries.length})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormRow>
          <Field label={t('common.language')}>
            <Select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="*">{t('glossary.allLanguages')}</option>
              {Object.values(LANGUAGES).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('glossary.mode')}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as GlossaryMode)}>
              {GLOSSARY_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`glossary.modes.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <Field label={t('glossary.bulkHint')}>
          <TextArea rows={10} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" />
        </Field>
      </div>
    </Modal>
  );
}
