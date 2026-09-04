import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantLanguagesSchema, tenantSettingsSchema, updateTenantSchema, type TenantDto, type TenantSettings } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Checkbox, Field, FormRow, Select, TextArea, TextInput } from '../components/Field';
import { LanguagePicker } from '../components/LanguagePicker';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fmtDate } from '../lib/format';
import { clean, validate } from '../lib/forms';

const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] as const;
type Prayer = (typeof PRAYERS)[number];

interface TenantLanguageRow {
  code: string;
  enabled: boolean;
  order: number;
}

interface Draft {
  name: string;
  timezone: string;
  locale: 'ar' | 'en';
  welcomeMessage: string;
  welcomeMessageEn: string;
  prayerTimes: Record<Prayer, string>;
  wordsPerMinute: string;
  publicDisplayEnabled: boolean;
  logoUrl: string;
}

function draftFrom(t: TenantDto): Draft {
  const s = t.settings as TenantSettings;
  const pt = (s.prayerTimes ?? {}) as Partial<Record<Prayer, string>>;
  return {
    name: t.name,
    timezone: t.timezone,
    locale: t.locale,
    welcomeMessage: s.welcomeMessage ?? '',
    welcomeMessageEn: s.welcomeMessageEn ?? '',
    prayerTimes: { fajr: pt.fajr ?? '', dhuhr: pt.dhuhr ?? '', asr: pt.asr ?? '', maghrib: pt.maghrib ?? '', isha: pt.isha ?? '', jumuah: pt.jumuah ?? '' },
    wordsPerMinute: s.wordsPerMinute ? String(s.wordsPerMinute) : '',
    publicDisplayEnabled: s.publicDisplayEnabled ?? true,
    logoUrl: s.logoUrl ?? '',
  };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const tenant = useQuery({ queryKey: ['tenant', tenantId], queryFn: () => api.get<TenantDto>('/tenant') });
  const langs = useQuery({ queryKey: ['tenant', 'languages', tenantId], queryFn: () => api.get<TenantLanguageRow[]>('/tenant/languages') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[] | null>(null);

  useEffect(() => {
    if (tenant.data && !draft) setDraft(draftFrom(tenant.data));
  }, [tenant.data, draft]);

  const enabledLangs = languages ?? langs.data?.filter((l) => l.enabled).map((l) => l.code) ?? [];

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<TenantDto>('/tenant', body),
    onSuccess: (data) => {
      toast.success(t('common.success'));
      qc.setQueryData(['tenant', tenantId], data);
      setDraft(draftFrom(data));
    },
    onError: (e) => toast.error(e),
  });
  const saveLangs = useMutation({
    mutationFn: (codes: string[]) => api.put('/tenant/languages', { languages: codes.map((code) => ({ code, enabled: true })) }),
    onSuccess: () => {
      toast.success(t('common.success'));
      setLanguages(null);
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    if (!draft) return;
    const prayerTimes = Object.fromEntries(Object.entries(draft.prayerTimes).filter(([, v]) => v.trim()));
    const settings = clean({
      welcomeMessage: draft.welcomeMessage,
      welcomeMessageEn: draft.welcomeMessageEn,
      prayerTimes: Object.keys(prayerTimes).length ? prayerTimes : undefined,
      logoUrl: draft.logoUrl.trim(),
      wordsPerMinute: draft.wordsPerMinute.trim() ? Number(draft.wordsPerMinute) : undefined,
      publicDisplayEnabled: draft.publicDisplayEnabled,
    });
    const sv = validate(tenantSettingsSchema, settings);
    const v = validate(updateTenantSchema.pick({ name: true, timezone: true, locale: true, settings: true }), { name: draft.name.trim(), timezone: draft.timezone.trim(), locale: draft.locale, settings });
    setErrors({ ...sv.errors, ...v.errors });
    if (sv.ok && v.ok) save.mutate(v.data);
  };

  const submitLangs = () => {
    const v = validate(tenantLanguagesSchema, { languages: enabledLangs.map((code) => ({ code, enabled: true })) });
    if (!v.ok) {
      toast.error(new Error(v.errors.languages ?? t('errors.VALIDATION')));
      return;
    }
    saveLangs.mutate(enabledLangs);
  };

  if (!draft || !tenant.data) return <Spinner />;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div>
      <PageHeader title={t('settings.title')} />
      <div className="flex flex-col gap-4">
        <Card
          title={t('settings.general')}
          actions={
            <Button variant="primary" onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : t('common.save')}
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <FormRow cols={3}>
              <Field label={t('settings.mosqueName')} error={errors.name}>
                <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label={t('settings.timezone')} error={errors.timezone}>
                <TextInput dir="ltr" value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} />
              </Field>
              <Field label={t('settings.locale')} error={errors.locale}>
                <Select value={draft.locale} onChange={(e) => set({ locale: e.target.value as 'ar' | 'en' })}>
                  <option value="ar">{t('common.arabic')}</option>
                  <option value="en">{t('common.english')}</option>
                </Select>
              </Field>
            </FormRow>
            <FormRow>
              <Field label={t('settings.welcomeMessage')} error={errors.welcomeMessage}>
                <TextArea rows={2} dir="rtl" lang="ar" value={draft.welcomeMessage} onChange={(e) => set({ welcomeMessage: e.target.value })} />
              </Field>
              <Field label={t('settings.welcomeMessageEn')} error={errors.welcomeMessageEn}>
                <TextArea rows={2} dir="ltr" lang="en" value={draft.welcomeMessageEn} onChange={(e) => set({ welcomeMessageEn: e.target.value })} />
              </Field>
            </FormRow>
            <div>
              <div className="j-label">{t('settings.prayerTimes')}</div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                {PRAYERS.map((p) => (
                  <Field key={p} label={t(`display.prayerTimes.${p}`)}>
                    <TextInput type="time" dir="ltr" value={draft.prayerTimes[p]} onChange={(e) => set({ prayerTimes: { ...draft.prayerTimes, [p]: e.target.value } })} />
                  </Field>
                ))}
              </div>
              {errors.prayerTimes && <div className="mt-1 text-xs" style={{ color: 'var(--j-danger)' }}>{errors.prayerTimes}</div>}
            </div>
            <FormRow>
              <Field label={t('settings.wordsPerMinute')} error={errors.wordsPerMinute}>
                <TextInput type="number" min={40} max={300} dir="ltr" value={draft.wordsPerMinute} onChange={(e) => set({ wordsPerMinute: e.target.value })} />
              </Field>
              <Field label={t('displays.logo')} error={errors.logoUrl}>
                <TextInput dir="ltr" value={draft.logoUrl} onChange={(e) => set({ logoUrl: e.target.value })} placeholder="https://" />
              </Field>
            </FormRow>
            <Checkbox label={t('settings.publicDisplay')} checked={draft.publicDisplayEnabled} onChange={(v) => set({ publicDisplayEnabled: v })} />
          </div>
        </Card>

        <Card
          title={t('settings.languages')}
          actions={
            <Button variant="primary" onClick={submitLangs} disabled={saveLangs.isPending || languages === null}>
              {saveLangs.isPending ? <Spinner /> : t('common.save')}
            </Button>
          }
        >
          <div className="j-muted mb-2 text-sm">{t('settings.languagesHint')}</div>
          <LanguagePicker value={enabledLangs} onChange={setLanguages} />
        </Card>

        <Card title={t('settings.subscription')}>
          <dl className="grid gap-3 text-sm md:grid-cols-4">
            <div>
              <dt className="j-muted text-xs">{t('settings.plan')}</dt>
              <dd className="font-semibold">{t(`tenants.plans.${tenant.data.plan}`)}</dd>
            </div>
            <div>
              <dt className="j-muted text-xs">{t('common.status')}</dt>
              <dd className="font-semibold">{t(`tenants.subscriptionStatus.${tenant.data.subscriptionStatus}`)}</dd>
            </div>
            <div>
              <dt className="j-muted text-xs">{t('tenants.subscriptionEndsAt')}</dt>
              <dd>{fmtDate(tenant.data.subscriptionEndsAt)}</dd>
            </div>
            <div>
              <dt className="j-muted text-xs">{t('tenants.slug')}</dt>
              <dd>
                <code className="j-kbd">{tenant.data.slug}</code>
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
