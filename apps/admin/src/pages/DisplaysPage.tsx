import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DISPLAY_LAYOUTS, DISPLAY_THEMES, MAX_DISPLAY_LANGUAGES, displaySchema, type DisplayDto, type DisplayLayout, type DisplayTheme } from '@jumaah/shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CopyButton } from '../components/CopyButton';
import { Checkbox, Field, FormRow, Select, TextInput } from '../components/Field';
import { LangNames, LanguagePicker } from '../components/LanguagePicker';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fmtDateTime, isOnline } from '../lib/format';
import { clean, validate } from '../lib/forms';

type DisplayWithUrls = DisplayDto & { url: string; publicUrl: string };

interface Draft {
  name: string;
  location: string;
  languages: string[];
  layout: DisplayLayout;
  fontScale: number;
  theme: DisplayTheme;
  showPrevious: boolean;
  showArabic: boolean;
  showQr: boolean;
  logoUrl: string;
}
const EMPTY: Draft = { name: '', location: '', languages: [], layout: 'single', fontScale: 1, theme: 'dark', showPrevious: true, showArabic: false, showQr: true, logoUrl: '' };

export function DisplaysPage() {
  const { t } = useTranslation();
  const { tenantId, isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [regenTarget, setRegenTarget] = useState<DisplayWithUrls | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DisplayWithUrls | null>(null);

  const list = useQuery({ queryKey: ['displays', tenantId], queryFn: () => api.get<DisplayWithUrls[]>('/displays'), refetchInterval: 30_000 });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['displays'] });

  const regen = useMutation({
    mutationFn: (id: string) => api.post(`/displays/${id}/regenerate-token`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/displays/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const items = list.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('displays.title')}
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setEditing({ id: null, draft: EMPTY })}>
              {t('displays.add')}
            </Button>
          )
        }
      />
      {list.isLoading && <Spinner />}
      {!list.isLoading && items.length === 0 && <EmptyState title={t('displays.noDisplays')} hint={t('displays.urlHint')} />}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((d) => {
          const online = isOnline(d.lastSeenAt);
          return (
            <div key={d.id} className="j-card flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{d.name}</div>
                  {d.location && <div className="j-muted text-xs">{d.location}</div>}
                </div>
                <StatusPill tone={online ? 'ok' : 'muted'}>{online ? t('displays.online') : t('displays.offline')}</StatusPill>
              </div>
              <LangNames codes={d.languages} />
              <div className="j-muted text-xs">
                {t('displays.layout')}: {t(`displays.layouts.${d.layout}`)} · {t('displays.theme')}: {t(`displays.themes.${d.theme}`)} · {t('displays.fontScale')}: ×{d.fontScale}
              </div>
              <div className="j-muted text-xs">
                {t('displays.lastSeen')}: {fmtDateTime(d.lastSeenAt)}
              </div>
              <div>
                <div className="j-label">{t('displays.url')}</div>
                <div className="flex items-center gap-2">
                  <code className="j-kbd flex-1 truncate" dir="ltr">
                    {d.url}
                  </code>
                  <CopyButton text={d.url} />
                  <a href={d.url} target="_blank" rel="noreferrer" className="j-btn px-2 py-1 text-xs">
                    {t('common.open')}
                  </a>
                </div>
              </div>
              <div>
                <div className="j-label">{t('displays.publicUrl')}</div>
                <div className="flex items-center gap-2">
                  <code className="j-kbd flex-1 truncate" dir="ltr">
                    {d.publicUrl}
                  </code>
                  <CopyButton text={d.publicUrl} />
                </div>
              </div>
              {isAdmin && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <Button
                    className="px-2 py-1 text-xs"
                    onClick={() =>
                      setEditing({
                        id: d.id,
                        draft: {
                          name: d.name,
                          location: d.location ?? '',
                          languages: d.languages,
                          layout: d.layout,
                          fontScale: d.fontScale,
                          theme: (DISPLAY_THEMES as readonly string[]).includes(d.theme) ? (d.theme as DisplayTheme) : 'dark',
                          showPrevious: d.showPrevious,
                          showArabic: d.showArabic,
                          showQr: d.showQr,
                          logoUrl: d.logoUrl ?? '',
                        },
                      })
                    }
                  >
                    {t('common.edit')}
                  </Button>
                  <Button className="px-2 py-1 text-xs" onClick={() => setRegenTarget(d)}>
                    {t('displays.regenerateToken')}
                  </Button>
                  <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(d)}>
                    {t('common.delete')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <DisplayModal state={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!regenTarget} onClose={() => setRegenTarget(null)} title={t('displays.regenerateToken')} message={t('displays.regenerateConfirm')} onConfirm={() => (regenTarget ? regen.mutateAsync(regenTarget.id).then(() => undefined) : undefined)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('common.areYouSure')} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
    </div>
  );
}

function DisplayModal({ state, onClose }: { state: { id: string | null; draft: Draft } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null | undefined>(undefined);
  if (state && key !== (state.id ?? 'new')) {
    setKey(state.id ?? 'new');
    setDraft(state.draft);
    setErrors({});
  }
  if (!state && key !== undefined) setKey(undefined);

  const save = useMutation({
    mutationFn: (body: unknown) => (state?.id ? api.patch<DisplayDto>(`/displays/${state.id}`, body) : api.post<DisplayDto>('/displays', body)),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['displays'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const v = validate(displaySchema, clean({ ...draft, name: draft.name.trim(), location: draft.location.trim(), logoUrl: draft.logoUrl.trim() }));
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={state?.id ? t('common.edit') : t('displays.add')}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormRow>
          <Field label={t('common.name')} error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label={t('displays.location')} error={errors.location}>
            <TextInput value={draft.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
        </FormRow>
        <Field label={`${t('common.languages')} (${draft.languages.length}/${MAX_DISPLAY_LANGUAGES})`} error={errors.languages}>
          <LanguagePicker value={draft.languages} onChange={(languages) => set({ languages })} max={MAX_DISPLAY_LANGUAGES} />
        </Field>
        <FormRow cols={3}>
          <Field label={t('displays.layout')} error={errors.layout}>
            <Select value={draft.layout} onChange={(e) => set({ layout: e.target.value as DisplayLayout })}>
              {DISPLAY_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {t(`displays.layouts.${l}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('displays.theme')} error={errors.theme}>
            <Select value={draft.theme} onChange={(e) => set({ theme: e.target.value as DisplayTheme })}>
              {DISPLAY_THEMES.map((th) => (
                <option key={th} value={th}>
                  {t(`displays.themes.${th}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`${t('displays.fontScale')} ×${draft.fontScale.toFixed(1)}`} error={errors.fontScale}>
            <input type="range" min={0.5} max={3} step={0.1} value={draft.fontScale} onChange={(e) => set({ fontScale: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--j-accent)' }} />
          </Field>
        </FormRow>
        <div className="flex flex-wrap gap-4">
          <Checkbox label={t('displays.showPrevious')} checked={draft.showPrevious} onChange={(v) => set({ showPrevious: v })} />
          <Checkbox label={t('displays.showArabic')} checked={draft.showArabic} onChange={(v) => set({ showArabic: v })} />
          <Checkbox label={t('displays.showQr')} checked={draft.showQr} onChange={(v) => set({ showQr: v })} />
        </div>
        <Field label={t('displays.logo')} error={errors.logoUrl} hint={t('common.optional')}>
          <TextInput dir="ltr" value={draft.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://" />
        </Field>
      </div>
    </Modal>
  );
}
