import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRAYER_METHODS, computePrayerTimes, tenantLanguagesSchema, tenantSettingsSchema, updateTenantSchema, type PrayerMethod, type TenantDto, type TenantSettings } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ArchiveCard } from '../components/ArchiveCard';
import { BillingCard } from '../components/BillingCard';
import { BrandingCard } from '../components/BrandingCard';
import { DomainCard } from '../components/DomainCard';
import { NetworkCard } from '../components/NetworkCard';
import { SignageCard } from '../components/SignageCard';
import { Checkbox, Field, FormRow, Select, TextArea, TextInput } from '../components/Field';
import { LanguagePicker } from '../components/LanguagePicker';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
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
  lat: string;
  lng: string;
  method: PrayerMethod;
  madhab: 'Shafi' | 'Hanafi';
}

const SECTIONS = [
  { id: 'general', key: 'settings.general' },
  { id: 'branding', key: 'branding.title' },
  { id: 'signage', key: 'signage.title' },
  { id: 'archive', key: 'archive.title' },
  { id: 'domain', key: 'domain.title' },
  { id: 'network', key: 'network.title' },
  { id: 'languages', key: 'settings.languages' },
  { id: 'billing', key: 'settings.subscription' },
] as const;

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
    lat: s.prayerLocation ? String(s.prayerLocation.lat) : '',
    lng: s.prayerLocation ? String(s.prayerLocation.lng) : '',
    method: s.prayerLocation?.method ?? 'UmmAlQura',
    madhab: s.prayerLocation?.madhab ?? 'Shafi',
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
      prayerLocation: draft.lat.trim() && draft.lng.trim() ? { lat: Number(draft.lat), lng: Number(draft.lng), method: draft.method, madhab: draft.madhab } : null,
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

  const ready = !!draft && !!tenant.data;
  useEffect(() => {
    if (!ready || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [ready]);

  if (!draft || !tenant.data) return <Spinner />;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div>
      <PageHeader title={t('settings.title')} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('settings.sections')}>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="j-btn px-3 py-1 text-xs" onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${s.id}`); }}>
            {t(s.key)}
          </a>
        ))}
      </nav>
      <div className="flex flex-col gap-4">
        <Card
          id="general"
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
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
              <div className="j-label">{t('settings.prayerLocation')}</div>
              <div className="j-muted mb-2 text-xs">{t('settings.prayerLocationHint')}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Field label={t('settings.latitude')} error={errors['prayerLocation.lat'] ?? errors.prayerLocation}>
                  <TextInput dir="ltr" inputMode="decimal" placeholder="24.7136" value={draft.lat} onChange={(e) => set({ lat: e.target.value })} />
                </Field>
                <Field label={t('settings.longitude')} error={errors['prayerLocation.lng']}>
                  <TextInput dir="ltr" inputMode="decimal" placeholder="46.6753" value={draft.lng} onChange={(e) => set({ lng: e.target.value })} />
                </Field>
                <Field label={t('settings.method')}>
                  <Select value={draft.method} onChange={(e) => set({ method: e.target.value as PrayerMethod })}>
                    {PRAYER_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {t(`settings.methods.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('settings.madhab')}>
                  <Select value={draft.madhab} onChange={(e) => set({ madhab: e.target.value as 'Shafi' | 'Hanafi' })}>
                    <option value="Shafi">{t('settings.madhabs.Shafi')}</option>
                    <option value="Hanafi">{t('settings.madhabs.Hanafi')}</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (pos) => set({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }),
                      () => toast.error(new Error(t('settings.locationDenied'))),
                      { timeout: 10_000 },
                    )
                  }
                >
                  {t('settings.useMyLocation')}
                </Button>
                {(draft.lat || draft.lng) && <Button onClick={() => set({ lat: '', lng: '' })}>{t('settings.clearLocation')}</Button>}
                <TodayTimes lat={draft.lat} lng={draft.lng} method={draft.method} madhab={draft.madhab} timezone={draft.timezone} />
              </div>
            </div>
            <div>
              <div className="j-label">{t('settings.prayerTimes')}</div>
              <div className="j-muted mb-2 text-xs">{t('settings.manualTimesHint')}</div>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                {PRAYERS.map((p) => (
                  <Field key={p} label={t(`display.prayerTimes.${p}`)}>
                    <TextInput type="time" dir="ltr" value={draft.prayerTimes[p]} disabled={p !== 'jumuah' && !!(draft.lat.trim() && draft.lng.trim())} onChange={(e) => set({ prayerTimes: { ...draft.prayerTimes, [p]: e.target.value } })} />
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

        <div id="branding" className="scroll-mt-20"><BrandingCard tenant={tenant.data} /></div>
        <div id="signage" className="scroll-mt-20"><SignageCard tenant={tenant.data} /></div>
        <div id="archive" className="scroll-mt-20"><ArchiveCard tenant={tenant.data} /></div>
        <div id="domain" className="scroll-mt-20"><DomainCard tenant={tenant.data} /></div>
        <div id="network" className="scroll-mt-20"><NetworkCard /></div>

        <Card
          id="languages"
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

        <div id="billing" className="scroll-mt-20"><BillingCard tenant={tenant.data} /></div>
      </div>
    </div>
  );
}

/** Preview of today's computed prayer times for the coordinates being edited. */
function TodayTimes({ lat, lng, method, madhab, timezone }: { lat: string; lng: string; method: PrayerMethod; madhab: 'Shafi' | 'Hanafi'; timezone: string }) {
  const { t } = useTranslation();
  const la = Number(lat), lo = Number(lng);
  if (!lat.trim() || !lng.trim() || !Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const times = computePrayerTimes({ lat: la, lng: lo, method, madhab }, timezone.trim() || 'Asia/Riyadh');
  if (!times) return null;
  return (
    <span className="j-muted text-xs" dir="ltr">
      {t('settings.todayTimes')}: {(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map((k) => `${t(`display.prayerTimes.${k}`)} ${times[k]}`).join(' · ')}
    </span>
  );
}
