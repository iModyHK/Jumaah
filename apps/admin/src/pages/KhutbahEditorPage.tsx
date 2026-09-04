import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SECTION_TYPES, getLanguage, shareToLibrarySchema, type KhutbahDto, type LibraryKhutbahDto, type ParagraphDto, type SectionDto, type SectionType, type TranslationJobDto } from '@jumaah/shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field, Select, TextArea, TextInput } from '../components/Field';
import { FileDrop } from '../components/FileDrop';
import { LangNames } from '../components/LanguagePicker';
import { Modal } from '../components/Modal';
import { ProgressBar } from '../components/ProgressBar';
import { KhutbahStatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { fmtDate, fmtDuration } from '../lib/format';
import { clean, validate } from '../lib/forms';
import { useSocketEvent } from '../lib/socket';
import { errorMessage } from '../lib/errors';
import { CopyKhutbahModal } from './KhutbahsPage';
import { AddParagraphModal } from './editor/AddParagraphModal';
import { EditKhutbahModal } from './editor/EditKhutbahModal';
import { ImportTranslationsModal } from './editor/ImportTranslationsModal';
import { JobProgress } from './editor/JobProgress';
import { ParagraphCard } from './editor/ParagraphCard';
import { SplitModal } from './editor/SplitModal';
import { TranslateModal } from './editor/TranslateModal';
import { VersionsModal } from './editor/VersionsModal';
import { khutbahKey, useInvalidateKhutbah } from './editor/hooks';

type Mode = 'paragraphs' | 'text';

export function KhutbahEditorPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateKhutbah(id);

  const khutbah = useQuery({ queryKey: khutbahKey(id), queryFn: () => api.get<KhutbahDto>(`/khutbahs/${id}`), enabled: !!id });
  const jobs = useQuery({ queryKey: ['khutbah', id, 'jobs'], queryFn: () => api.get<TranslationJobDto[]>(`/khutbahs/${id}/jobs`), enabled: !!id && canEdit });

  const [tab, setTab] = useState<SectionType>('FIRST');
  const [mode, setMode] = useState<Mode>('paragraphs');
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<TranslationJobDto | null>(null);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [splitTarget, setSplitTarget] = useState<ParagraphDto | null>(null);
  const [deleteParagraph, setDeleteParagraph] = useState<ParagraphDto | null>(null);
  const [addAfter, setAddAfter] = useState<{ sectionId: string; afterId: string | null } | null>(null);

  useSocketEvent(
    'khutbah:changed',
    useCallback(
      (info: { khutbahId: string; version: number }) => {
        if (info.khutbahId === id) void qc.invalidateQueries({ queryKey: khutbahKey(id) });
      },
      [id, qc],
    ),
  );

  useEffect(() => {
    const running = jobs.data?.find((j) => j.status === 'QUEUED' || j.status === 'RUNNING');
    if (running && !activeJob) setActiveJob(running);
  }, [jobs.data, activeJob]);

  const del = useMutation({
    mutationFn: () => api.delete(`/khutbahs/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['khutbahs'] });
      navigate('/khutbahs');
    },
    onError: (e) => toast.error(e),
  });
  const delParagraph = useMutation({
    mutationFn: (pid: string) => api.delete(`/paragraphs/${pid}`),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e),
  });

  const k = khutbah.data;
  const section = useMemo(() => k?.sections?.find((s) => s.type === tab) ?? null, [k, tab]);
  const languages = useMemo(() => (k ? (langFilter && k.targetLanguages.includes(langFilter) ? [langFilter] : k.targetLanguages) : []), [k, langFilter]);

  if (khutbah.isLoading) return <Spinner />;
  if (khutbah.isError || !k) return <EmptyState title={t('errors.NOT_FOUND')} hint={khutbah.error ? errorMessage(khutbah.error) : undefined} />;

  const stats = k.stats;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="j-card flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{k.title}</h1>
              <KhutbahStatusBadge status={k.status} />
              {k.libraryId && <StatusPill tone="muted">{t('khutbah.shared')}</StatusPill>}
            </div>
            <div className="j-muted mt-1 text-sm">
              {fmtDate(k.gregorianDate)}
              {k.hijriDate && ` · ${k.hijriDate}`}
              {k.imamName && ` · ${k.imamName}`}
              {stats && ` · ${t('khutbah.paragraphs')}: ${stats.paragraphs} · ${fmtDuration(stats.estimatedSeconds)}`}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="j-muted text-xs">{t('khutbah.targetLanguages')}:</span>
              <LangNames codes={k.targetLanguages} />
              {canEdit && (
                <Button className="px-2 py-0.5 text-xs" onClick={() => setEditOpen(true)}>
                  {t('common.edit')}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/khutbahs" className="j-btn px-3 py-1 text-sm">
              {t('common.back')}
            </Link>
            {canEdit && (
              <>
                <Button variant="primary" className="px-3 py-1 text-sm" onClick={() => setTranslateOpen(true)} disabled={!!activeJob && (activeJob.status === 'QUEUED' || activeJob.status === 'RUNNING')}>
                  {t('khutbah.translate')}
                </Button>
                <Button className="px-3 py-1 text-sm" onClick={() => setApproveOpen(true)}>
                  {t('khutbah.approveAll')}
                </Button>
                <Button className="px-3 py-1 text-sm" onClick={() => setImportOpen(true)}>
                  {t('khutbah.importTranslations')}
                </Button>
              </>
            )}
            <Button className="px-3 py-1 text-sm" onClick={() => setVersionsOpen(true)}>
              {t('khutbah.versions')}
            </Button>
            {canEdit && (
              <>
                <Button className="px-3 py-1 text-sm" onClick={() => setShareOpen(true)}>
                  {t('khutbah.shareToLibrary')}
                </Button>
                <Button className="px-3 py-1 text-sm" onClick={() => setCopyOpen(true)}>
                  {t('khutbah.copy')}
                </Button>
                <Button variant="danger" className="px-3 py-1 text-sm" onClick={() => setDeleteOpen(true)}>
                  {t('common.delete')}
                </Button>
              </>
            )}
            <a href="/imam/" target="_blank" rel="noreferrer" className="j-btn px-3 py-1 text-sm" style={{ borderColor: 'var(--j-accent)', color: 'var(--j-accent)' }}>
              {t('khutbah.startLive')}
            </a>
          </div>
        </div>

        {stats && stats.paragraphs > 0 && k.targetLanguages.length > 0 && (
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
            {k.targetLanguages.map((lang) => {
              const s = stats.perLanguage[lang] ?? { approved: 0, reviewed: 0, machine: 0, pending: 0, rejected: 0 };
              return (
                <div key={lang} className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs">
                  <span className="truncate" lang={lang} dir={getLanguage(lang).dir}>
                    {getLanguage(lang).nativeName}
                  </span>
                  <ProgressBar value={s.approved} max={stats.paragraphs} label={`${s.approved}/${stats.paragraphs}`} />
                </div>
              );
            })}
          </div>
        )}

        {activeJob && (
          <JobProgress
            job={activeJob}
            onFinished={() => {
              void invalidate();
              void jobs.refetch();
            }}
            onDismiss={() => setActiveJob(null)}
          />
        )}
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {SECTION_TYPES.map((s) => {
            const count = k.sections?.find((x) => x.type === s)?.paragraphs.length ?? 0;
            return (
              <button key={s} type="button" className="j-chip" data-active={tab === s} onClick={() => setTab(s)}>
                {t(`khutbah.sections.${s}`)}
                <span className="j-muted">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <span className="j-muted text-xs">{t('khutbah.filterLanguage')}</span>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="j-chip" data-active={langFilter === null} onClick={() => setLangFilter(null)}>
              {t('common.all')}
            </button>
            {k.targetLanguages.map((lang) => (
              <button key={lang} type="button" className="j-chip" data-active={langFilter === lang} onClick={() => setLangFilter(lang)}>
                <span lang={lang} dir={getLanguage(lang).dir}>
                  {getLanguage(lang).nativeName}
                </span>
              </button>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-1">
              <button type="button" className="j-chip" data-active={mode === 'paragraphs'} onClick={() => setMode('paragraphs')}>
                {t('khutbah.paragraphMode')}
              </button>
              <button type="button" className="j-chip" data-active={mode === 'text'} onClick={() => setMode('text')}>
                {t('khutbah.textMode')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {section && mode === 'text' && canEdit && <TextSectionEditor key={`${section.id}:${k.version}`} khutbahId={id} section={section} />}
      {section && mode === 'paragraphs' && (
        <div className="flex flex-col gap-3">
          {section.paragraphs.length === 0 && <EmptyState title={t('khutbah.noParagraphs')} hint={canEdit ? t('khutbah.splitHint') : undefined} />}
          {section.paragraphs.map((p, i) => (
            <ParagraphCard
              key={p.id}
              khutbahId={id}
              paragraph={p}
              index={i}
              next={section.paragraphs[i + 1] ?? null}
              languages={languages}
              canEdit={canEdit}
              onSplit={setSplitTarget}
              onAddAfter={(par) => setAddAfter({ sectionId: section.id, afterId: par.id })}
              onDelete={setDeleteParagraph}
            />
          ))}
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAddAfter({ sectionId: section.id, afterId: section.paragraphs[section.paragraphs.length - 1]?.id ?? null })}>{t('khutbah.addParagraph')}</Button>
              <SectionImport khutbahId={id} sectionType={section.type} />
            </div>
          )}
        </div>
      )}
      {!section && <EmptyState title={t('khutbah.noParagraphs')} />}

      {/* Modals */}
      <TranslateModal khutbah={k} open={translateOpen} onClose={() => setTranslateOpen(false)} onStarted={(job) => setActiveJob(job)} />
      <VersionsModal khutbahId={id} open={versionsOpen} onClose={() => setVersionsOpen(false)} canEdit={canEdit} />
      <EditKhutbahModal khutbah={k} open={editOpen} onClose={() => setEditOpen(false)} />
      <ShareModal khutbah={k} open={shareOpen} onClose={() => setShareOpen(false)} />
      <ApproveAllModal khutbah={k} open={approveOpen} onClose={() => setApproveOpen(false)} />
      <ImportTranslationsModal key={`${langFilter ?? 'all'}:${importOpen}`} khutbah={k} open={importOpen} onClose={() => setImportOpen(false)} initialLang={langFilter ?? undefined} />
      <CopyKhutbahModal khutbah={copyOpen ? k : null} onClose={() => setCopyOpen(false)} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} danger message={t('khutbah.deleteConfirm')} onConfirm={() => del.mutateAsync().then(() => undefined)} />
      <SplitModal khutbahId={id} paragraph={splitTarget} onClose={() => setSplitTarget(null)} />
      <ConfirmDialog open={!!deleteParagraph} onClose={() => setDeleteParagraph(null)} danger message={t('khutbah.deleteParagraphConfirm')} onConfirm={() => (deleteParagraph ? delParagraph.mutateAsync(deleteParagraph.id).then(() => undefined) : undefined)} />
      {addAfter && <AddParagraphModal khutbahId={id} sectionId={addAfter.sectionId} afterId={addAfter.afterId} open onClose={() => setAddAfter(null)} />}
    </div>
  );
}

/** Whole-section text mode: paragraphs joined by blank lines; saving re-splits and resets changed translations. */
function TextSectionEditor({ khutbahId, section }: { khutbahId: string; section: SectionDto }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const original = section.paragraphs.map((p) => p.textAr).join('\n\n');
  const [text, setText] = useState(original);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const save = useMutation({
    mutationFn: () => api.put<KhutbahDto>(`/khutbahs/${khutbahId}/sections/${section.type}`, { rawText: text }),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <div className="j-card flex flex-col gap-3 p-4">
      <TextArea className="j-textarea-ar" dir="rtl" lang="ar" rows={18} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('khutbah.textPlaceholder')} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={text === original || save.isPending} onClick={() => setConfirmOpen(true)}>
          {save.isPending ? <Spinner /> : t('khutbah.saveText')}
        </Button>
        <Button disabled={text === original} onClick={() => setText(original)}>
          {t('common.cancel')}
        </Button>
        <SectionImport khutbahId={khutbahId} sectionType={section.type} />
        <span className="j-muted text-xs">{t('khutbah.splitHint')}</span>
      </div>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} danger message={t('khutbah.replaceTextWarning')} confirmLabel={t('khutbah.saveText')} onConfirm={() => save.mutateAsync().then(() => undefined)} />
    </div>
  );
}

function SectionImport({ khutbahId, sectionType }: { khutbahId: string; sectionType: SectionType }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await api.upload(`/khutbahs/${khutbahId}/import`, file, { section: sectionType });
      toast.success(t('common.success'));
      await invalidate();
    } catch (err) {
      toast.error(err);
      throw err;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <FileDrop accept=".docx,.txt,.pdf" label={t('khutbah.importFile')} busy={busy} onFile={(f) => setFile(f)} />
      <ConfirmDialog
        open={!!file}
        onClose={() => setFile(null)}
        danger
        message={
          <>
            <div className="mb-2">
              <code className="j-kbd">{file?.name}</code>
            </div>
            {t('khutbah.replaceTextWarning')}
          </>
        }
        onConfirm={run}
      />
    </>
  );
}

function ShareModal({ khutbah, open, onClose }: { khutbah: KhutbahDto; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbah.id);
  const qc = useQueryClient();
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const share = useMutation({
    mutationFn: (body: unknown) => api.post<LibraryKhutbahDto>('/library/share', body),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
      void qc.invalidateQueries({ queryKey: ['library'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(
      shareToLibrarySchema,
      clean({
        khutbahId: khutbah.id,
        description: description.trim(),
        tags: tags
          .split(/[,،]/)
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    );
    setErrors(v.errors);
    if (v.ok) share.mutate(v.data);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.shareToLibrary')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={share.isPending}>
            {share.isPending ? <Spinner /> : t('khutbah.shareToLibrary')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('khutbah.description')} error={errors.description}>
          <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t('library.tags')} error={errors.tags} hint="tag1, tag2">
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ApproveAllModal({ khutbah, open, onClose }: { khutbah: KhutbahDto; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbah.id);
  const [lang, setLang] = useState('');
  const approve = useMutation({
    mutationFn: () => api.post<{ approved: number }>(`/khutbahs/${khutbah.id}/approve-all`, lang ? { lang } : {}),
    onSuccess: (r) => {
      toast.success(`${t('khutbah.approveAll')}: ${r.approved}`);
      void invalidate();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.approveAll')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => approve.mutate()} disabled={approve.isPending}>
            {approve.isPending ? <Spinner /> : t('khutbah.approve')}
          </Button>
        </>
      }
    >
      <Field label={t('common.language')}>
        <Select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {khutbah.targetLanguages.map((code) => (
            <option key={code} value={code}>
              {getLanguage(code).nativeName} ({code})
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
