import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brandingSchema, type Branding, type Features, type TenantDto } from '@jumaah/core';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Checkbox, Field, FormRow, TextArea } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { validate } from '../lib/forms';
import { useExtensions } from '../extensions';

interface FeaturesDto {
  features: Features;
  [ext: string]: unknown;
}

/** The API accepts logo data URLs up to this many characters (about 220 KB of image). */
const LOGO_MAX_CHARS = 300_000;
/** Longest side to try, largest first; the first encoding that fits the limit wins. */
const SIDES = [512, 384, 256, 192];

/**
 * Turn an image file into a data URL that fits the API limit: SVG as is; rasters are drawn at up to 512px and
 * encoded as WebP (keeps transparency, much smaller than PNG), then PNG where the browser cannot write WebP,
 * shrinking step by step until it fits. Photos and detailed logos used to fail at 512px PNG.
 */
async function fileToLogo(file: File): Promise<string> {
  if (file.type === 'image/svg+xml') {
    const text = await file.text();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('bad image'));
      i.src = url;
    });
    let smallest = '';
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const [type, quality] of [['image/webp', 0.9], ['image/png', undefined]] as const) {
        const out = canvas.toDataURL(type, quality);
        if (!out.startsWith(`data:${type}`)) continue; // the browser cannot encode this type
        if (out.length <= LOGO_MAX_CHARS) return out;
        if (!smallest || out.length < smallest.length) smallest = out;
      }
    }
    return smallest;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Branding: logo upload, colours, custom CSS and the Jumaah mark. Fields outside the mosque's features are locked or hidden. */
export function BrandingCard({ tenant }: { tenant: TenantDto }) {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const features = useQuery({ queryKey: ['tenant', 'features', tenantId], queryFn: () => api.get<FeaturesDto>('/tenant/features') });
  const stored = ((tenant.settings as { branding?: Branding }).branding ?? {}) as Branding;
  const [draft, setDraft] = useState<Branding>(stored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(stored), [tenant.id, tenant.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = features.data?.features;
  const ext = useExtensions();
  // A locked field shows the extension's label ("needs the Standard plan"); without one it is simply hidden.
  const lockLabel = (feature: string) => ext.lockedFeatureLabel?.(feature, features.data as Record<string, unknown> | undefined, t as never) ?? null;
  const lock = (ok: boolean | undefined, feature: string) => (ok ? null : <span className="j-muted text-xs"> · {lockLabel(feature)}</span>);
  const show = (ok: boolean | undefined, feature: string) => !features.data || ok || !!lockLabel(feature);

  const save = useMutation({
    mutationFn: (branding: Branding) => api.patch<TenantDto>('/tenant', { settings: { branding } }),
    onSuccess: (data) => {
      toast.success(t('common.success'));
      qc.setQueryData(['tenant', tenantId], data);
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const body: Branding = {
      logoDataUrl: draft.logoDataUrl ?? null,
      primary: draft.primary || null,
      accent: draft.accent || null,
      css: draft.css?.trim() ? draft.css : null,
      hideMark: !!draft.hideMark,
    };
    const v = validate(brandingSchema, body);
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await fileToLogo(file);
      if (dataUrl.length > LOGO_MAX_CHARS) throw new Error(t('branding.tooLarge'));
      setDraft((d) => ({ ...d, logoDataUrl: dataUrl }));
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Card
      title={t('branding.title')}
      actions={
        <Button variant="primary" onClick={submit} disabled={save.isPending}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </Button>
      }
    >
      <div className="j-muted mb-3 text-sm">{t('branding.hint')}</div>
      <div className="flex flex-col gap-4">
        <Field label={<>{t('branding.logo')}{lock(f?.logoUpload, 'logoUpload')}</>} error={errors.logoDataUrl}>
          <div className="flex flex-wrap items-center gap-3">
            {draft.logoDataUrl ? (
              <img src={draft.logoDataUrl} alt="" className="h-14 w-auto max-w-40 rounded-md object-contain" style={{ background: 'var(--j-bg-soft)' }} />
            ) : (
              <span className="j-muted text-sm">{t('branding.noLogo')}</span>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={!f?.logoUpload}>
              {t('branding.upload')}
            </Button>
            {draft.logoDataUrl && (
              <Button onClick={() => setDraft((d) => ({ ...d, logoDataUrl: null }))}>{t('common.delete')}</Button>
            )}
          </div>
        </Field>
        {show(f?.colours, 'colours') && (
        <FormRow>
          <Field label={<>{t('branding.primary')}{lock(f?.colours, 'colours')}</>} error={errors.primary} hint={t('branding.primaryHint')}>
            <div className="flex items-center gap-2">
              <input type="color" value={draft.primary ?? '#1e6b58'} disabled={!f?.colours} onChange={(e) => setDraft((d) => ({ ...d, primary: e.target.value }))} className="h-9 w-12 rounded-md border" style={{ borderColor: 'var(--j-border)', background: 'transparent' }} />
              <code className="j-kbd" dir="ltr">{draft.primary ?? '—'}</code>
              {draft.primary && <Button className="px-2 py-1 text-xs" onClick={() => setDraft((d) => ({ ...d, primary: null }))}>{t('common.reset')}</Button>}
            </div>
          </Field>
          <Field label={<>{t('branding.background')}{lock(f?.colours, 'colours')}</>} error={errors.accent} hint={t('branding.backgroundHint')}>
            <div className="flex items-center gap-2">
              <input type="color" value={draft.accent ?? '#0b1220'} disabled={!f?.colours} onChange={(e) => setDraft((d) => ({ ...d, accent: e.target.value }))} className="h-9 w-12 rounded-md border" style={{ borderColor: 'var(--j-border)', background: 'transparent' }} />
              <code className="j-kbd" dir="ltr">{draft.accent ?? '—'}</code>
              {draft.accent && <Button className="px-2 py-1 text-xs" onClick={() => setDraft((d) => ({ ...d, accent: null }))}>{t('common.reset')}</Button>}
            </div>
          </Field>
        </FormRow>
        )}
        {show(f?.css, 'css') && (
        <Field label={<>{t('branding.css')}{lock(f?.css, 'css')}</>} error={errors.css} hint={t('branding.cssHint')}>
          <TextArea dir="ltr" rows={5} value={draft.css ?? ''} disabled={!f?.css} onChange={(e) => setDraft((d) => ({ ...d, css: e.target.value }))} placeholder=".j-idle-name { letter-spacing: .02em }" style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} />
        </Field>
        )}
        <div className="flex items-center gap-2">
          <Checkbox label={t('branding.hideMark')} checked={!!draft.hideMark} disabled={!f?.hideMark} onChange={(v) => setDraft((d) => ({ ...d, hideMark: v }))} />
          {lock(f?.hideMark, 'hideMark')}
        </div>
      </div>
    </Card>
  );
}
