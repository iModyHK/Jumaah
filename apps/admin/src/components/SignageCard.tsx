import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { signageSchema, type Announcement, type Features, type Signage, type TenantDto } from '@jumaah/core';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Checkbox, Field, FormRow, TextArea, TextInput } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { validate } from '../lib/forms';
import { useExtensions } from '../extensions';

interface FeaturesDto {
  features: Features;
  [ext: string]: unknown;
}

const newId = () => `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Screens between khutbahs: Hijri/Gregorian date and scheduled announcements. */
export function SignageCard({ tenant }: { tenant: TenantDto }) {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const features = useQuery({ queryKey: ['tenant', 'features', tenantId], queryFn: () => api.get<FeaturesDto>('/tenant/features') });
  const stored = ((tenant.settings as { signage?: Signage }).signage ?? {}) as Signage;
  const [showDate, setShowDate] = useState(!!stored.showDate);
  const [items, setItems] = useState<Announcement[]>(stored.announcements ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setShowDate(!!stored.showDate);
    setItems(stored.announcements ?? []);
  }, [tenant.id, tenant.settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const allowed = !!features.data?.features.signage;
  const ext = useExtensions();
  const lockLabel = allowed ? null : (ext.lockedFeatureLabel?.('signage', features.data as Record<string, unknown> | undefined, t as never) ?? null);

  const save = useMutation({
    mutationFn: (signage: Signage) => api.patch<TenantDto>('/tenant', { settings: { signage } }),
    onSuccess: (data) => {
      toast.success(t('common.success'));
      qc.setQueryData(['tenant', tenantId], data);
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const body: Signage = { showDate, announcements: items.map((a) => ({ ...a, textAr: a.textAr.trim(), textEn: a.textEn.trim(), from: a.from || null, until: a.until || null })) };
    const v = validate(signageSchema, body);
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };
  const update = (id: string, patch: Partial<Announcement>) => setItems((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const move = (id: string, dir: -1 | 1) =>
    setItems((xs) => {
      const i = xs.findIndex((a) => a.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const copy = xs.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <Card
      title={t('signage.title')}
      actions={
        <Button variant="primary" onClick={submit} disabled={save.isPending || !allowed}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </Button>
      }
    >
      <div className="j-muted mb-3 text-sm">
        {t('signage.hint')}
        {lockLabel && <span> · {lockLabel}</span>}
      </div>
      <div className="flex flex-col gap-4">
        <Checkbox label={t('signage.showDate')} checked={showDate} disabled={!allowed} onChange={setShowDate} />
        <div className="flex items-center justify-between">
          <span className="font-semibold">{t('signage.announcements')}</span>
          <Button disabled={!allowed || items.length >= 20} onClick={() => setItems((xs) => [...xs, { id: newId(), textAr: '', textEn: '', from: null, until: null, enabled: true }])}>
            {t('signage.add')}
          </Button>
        </div>
        {items.length === 0 && <div className="j-muted text-sm">{t('signage.none')}</div>}
        {items.map((a, i) => (
          <div key={a.id} className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
            <FormRow>
              <Field label={t('signage.textAr')} error={errors[`announcements.${i}.textAr`] ?? errors[`announcements.${i}`]}>
                <TextArea dir="rtl" rows={2} value={a.textAr} disabled={!allowed} onChange={(e) => update(a.id, { textAr: e.target.value })} />
              </Field>
              <Field label={t('signage.textEn')} error={errors[`announcements.${i}.textEn`]}>
                <TextArea dir="ltr" rows={2} value={a.textEn} disabled={!allowed} onChange={(e) => update(a.id, { textEn: e.target.value })} />
              </Field>
            </FormRow>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <Field label={t('signage.from')}>
                <TextInput type="date" value={a.from ?? ''} disabled={!allowed} onChange={(e) => update(a.id, { from: e.target.value || null })} />
              </Field>
              <Field label={t('signage.until')}>
                <TextInput type="date" value={a.until ?? ''} disabled={!allowed} onChange={(e) => update(a.id, { until: e.target.value || null })} />
              </Field>
              <Checkbox label={t('common.enabled')} checked={a.enabled !== false} disabled={!allowed} onChange={(v) => update(a.id, { enabled: v })} />
              <span className="ms-auto flex gap-1">
                <Button className="px-2 py-1 text-xs" disabled={!allowed || i === 0} onClick={() => move(a.id, -1)} aria-label="up">
                  ↑
                </Button>
                <Button className="px-2 py-1 text-xs" disabled={!allowed || i === items.length - 1} onClick={() => move(a.id, 1)} aria-label="down">
                  ↓
                </Button>
                <Button variant="danger" className="px-2 py-1 text-xs" disabled={!allowed} onClick={() => setItems((xs) => xs.filter((x) => x.id !== a.id))}>
                  {t('common.delete')}
                </Button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
