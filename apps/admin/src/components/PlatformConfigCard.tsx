import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmailLogDto, PlatformConfigDto, PlatformConfigGroup } from '@jumaah/core';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { Checkbox, Field, FormRow, Select, TextInput } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { fmtDateTime } from '../lib/format';

type Values = Record<string, unknown>;
type Secret = { set: boolean; hint: string | null };

/** One settings group as a form: text, number, boolean and secret fields, saved as a whole. */
function GroupForm({ group, values, fromPortal, secretFields, fields, onSaved }: { group: PlatformConfigGroup; values: Values; fromPortal: string[]; secretFields: string[]; fields: Array<{ key: string; type: 'text' | 'number' | 'boolean' | 'secret' | 'select'; options?: string[]; dir?: 'ltr' | 'rtl'; placeholder?: string }>; onSaved: (d: PlatformConfigDto) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<Values>({});
  const [clear, setClear] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const d: Values = {};
    for (const f of fields) d[f.key] = f.type === 'secret' ? '' : (values[f.key] ?? (f.type === 'boolean' ? false : ''));
    setDraft(d);
    setClear({});
  }, [values, fields]);
  const save = useMutation({
    mutationFn: () => {
      const body: Values = {};
      for (const f of fields) {
        const v = draft[f.key];
        if (f.type === 'secret') body[f.key] = clear[f.key] ? null : (v as string) || undefined;
        else if (f.type === 'number') body[f.key] = v === '' || v === null ? null : Number(v);
        else if (f.type === 'boolean') body[f.key] = !!v;
        else body[f.key] = typeof v === 'string' && v.trim() === '' ? null : v;
      }
      return api.put<PlatformConfigDto>(`/platform/config/${group}`, body);
    },
    onSuccess: (d) => {
      toast.success(t('common.success'));
      onSaved(d);
    },
    onError: (e) => toast.error(e),
  });
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const source = (k: string) => (fromPortal.includes(`${group}.${k}`) ? t('platformConfig.fromPortal') : t('platformConfig.fromEnv'));

  return (
    <div className="flex flex-col gap-3">
      <FormRow cols={2}>
        {fields.map((f) => {
          const label = t(`platformConfig.fields.${group}.${f.key}`);
          if (f.type === 'boolean')
            return (
              <div key={f.key} className="pt-5">
                <Checkbox label={label} checked={!!draft[f.key]} onChange={(v) => set(f.key, v)} />
              </div>
            );
          if (f.type === 'select')
            return (
              <Field key={f.key} label={label} hint={source(f.key)}>
                <Select value={String(draft[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options!.map((o) => (
                    <option key={o} value={o}>
                      {t(`platformConfig.options.${o}`, { defaultValue: o })}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          if (f.type === 'secret') {
            const s = values[f.key] as Secret | undefined;
            return (
              <Field key={f.key} label={label} hint={s?.set ? `${t('platformConfig.secretSet')} ${s.hint ?? ''} · ${source(f.key)}` : t('platformConfig.secretUnset')}>
                <div className="flex items-center gap-2">
                  <TextInput type="password" dir="ltr" autoComplete="new-password" value={String(draft[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={s?.set ? '••••••••' : ''} disabled={!!clear[f.key]} />
                  {s?.set && <Checkbox label={t('platformConfig.clearSecret')} checked={!!clear[f.key]} onChange={(v) => setClear((c) => ({ ...c, [f.key]: v }))} />}
                </div>
              </Field>
            );
          }
          return (
            <Field key={f.key} label={label} hint={source(f.key)}>
              <TextInput type={f.type === 'number' ? 'number' : 'text'} dir={f.dir ?? 'ltr'} value={String(draft[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
            </Field>
          );
        })}
      </FormRow>
      <div>
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !secretFields}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </Button>
      </div>
    </div>
  );
}

const FIELDS: Record<PlatformConfigGroup, Array<{ key: string; type: 'text' | 'number' | 'boolean' | 'secret' | 'select'; options?: string[]; dir?: 'ltr' | 'rtl'; placeholder?: string }>> = {
  billing: [
    { key: 'sellerName', type: 'text', dir: 'rtl' },
    { key: 'sellerAddress', type: 'text', dir: 'rtl' },
    { key: 'vatRate', type: 'number', placeholder: '0 or 0.15' },
    { key: 'vatNumber', type: 'text', placeholder: '3xxxxxxxxxxxxx3' },
    { key: 'bank', type: 'text', dir: 'rtl' },
    { key: 'iban', type: 'text', placeholder: 'SA...' },
  ],
  payment: [
    { key: 'provider', type: 'select', options: ['manual', 'moyasar'] },
    { key: 'moyasarSecretKey', type: 'secret' },
    { key: 'moyasarWebhookSecret', type: 'secret' },
  ],
  email: [
    { key: 'host', type: 'text', placeholder: 'smtp.example.com' },
    { key: 'port', type: 'number', placeholder: '587' },
    { key: 'secure', type: 'boolean' },
    { key: 'user', type: 'text' },
    { key: 'pass', type: 'secret' },
    { key: 'fromName', type: 'text', dir: 'rtl' },
    { key: 'fromEmail', type: 'text', placeholder: 'no-reply@jumaah.net' },
    { key: 'replyTo', type: 'text' },
    { key: 'notifyEmail', type: 'text' },
  ],
  security: [
    { key: 'turnstileSecret', type: 'secret' },
    { key: 'siteUrl', type: 'text', placeholder: 'https://www.jumaah.net' },
  ],
};

/** Platform settings editable in the portal: billing and VAT, payments, email, security. */
export function PlatformConfigCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'config'], queryFn: () => api.get<PlatformConfigDto>('/platform/config') });
  const emails = useQuery({ queryKey: ['platform', 'emails'], queryFn: () => api.get<EmailLogDto[]>('/platform/emails', { limit: 10 }), refetchInterval: 60_000 });
  const [group, setGroup] = useState<PlatformConfigGroup>('billing');
  const [testTo, setTestTo] = useState('');
  const [payResult, setPayResult] = useState<string | null>(null);
  const payTest = useMutation({
    mutationFn: () => api.post<{ configured: boolean; ok: boolean; status: number; mode: string; message: string | null }>('/platform/config/payment/test'),
    onSuccess: (r) => setPayResult(!r.configured ? t('platformConfig.payNotConfigured') : r.ok ? t('platformConfig.payOk', { mode: r.mode }) : `${t('platformConfig.payFailed')} (${r.status}) ${r.message ?? ''}`),
    onError: (e) => toast.error(e),
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: () => api.post<{ status: string; error: string | null; configured: boolean }>('/platform/config/email/test', { to: testTo.trim(), locale: 'ar' }),
    onSuccess: (r) => {
      setTestResult(r.status === 'SENT' ? t('platformConfig.testSent') : r.configured ? `${t('platformConfig.testFailed')}: ${r.error ?? ''}` : t('platformConfig.notConfigured'));
      void qc.invalidateQueries({ queryKey: ['platform', 'emails'] });
    },
    onError: (e) => toast.error(e),
  });
  const d = q.data;
  const groups: PlatformConfigGroup[] = ['billing', 'payment', 'email', 'security'];

  return (
    <Card title={t('platformConfig.title')} className="mt-4">
      <div className="j-muted mb-3 text-sm">{t('platformConfig.hint')}</div>
      {q.isLoading && <Spinner />}
      {d && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Button key={g} variant={g === group ? 'primary' : 'default'} className="px-3 py-1 text-sm" onClick={() => setGroup(g)}>
                {t(`platformConfig.groups.${g}`)}
              </Button>
            ))}
          </div>
          <GroupForm key={group} group={group} values={d.groups[group] as Values} fromPortal={d.fromPortal} secretFields={d.secretFields[group]} fields={FIELDS[group]} onSaved={(next) => qc.setQueryData(['platform', 'config'], next)} />
          {group === 'payment' && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
              <div className="j-label">{t('platformConfig.payTest')}</div>
              <div className="j-muted mb-2 text-xs">{t('platformConfig.payTestHint')}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => payTest.mutate()} disabled={payTest.isPending}>
                  {payTest.isPending ? <Spinner /> : t('platformConfig.payTestRun')}
                </Button>
                {payResult && <span className="text-sm">{payResult}</span>}
              </div>
            </div>
          )}
          {group === 'email' && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
              <div className="j-label">{t('platformConfig.testEmail')}</div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t('platformConfig.testTo')}>
                  <TextInput type="email" dir="ltr" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="w-64" />
                </Field>
                <Button onClick={() => test.mutate()} disabled={test.isPending || !testTo.trim()}>
                  {test.isPending ? <Spinner /> : t('platformConfig.sendTest')}
                </Button>
                {testResult && <span className="text-sm">{testResult}</span>}
              </div>
              <div className="j-label mt-3">{t('platformConfig.recentEmails')}</div>
              {emails.data && emails.data.length === 0 && <div className="j-muted text-sm">—</div>}
              {emails.data?.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs" style={{ borderTop: '1px solid var(--j-border)' }}>
                  <span className="min-w-0 truncate">
                    <span dir="ltr">{m.to}</span> · {m.subject}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="j-muted">{fmtDateTime(m.createdAt)}</span>
                    <StatusPill tone={m.status === 'SENT' ? 'ok' : m.status === 'FAILED' ? 'danger' : 'muted'}>{t(`platformConfig.emailStatus.${m.status}`)}</StatusPill>
                    {m.error && <span style={{ color: 'var(--j-danger)' }}>{m.error}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
