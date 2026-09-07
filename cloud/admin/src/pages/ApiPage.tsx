import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WEBHOOK_EVENTS, createApiKeySchema, createWebhookSchema, type ApiKeyDto, type PlanFeatures, type SubscriptionPlan, type WebhookDto, type WebhookEvent } from '@jumaah/cloud-shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '@jumaah/admin';
import { useAuth } from '@jumaah/admin';
import { CopyButton } from '@jumaah/admin';
import { Checkbox, Field, FormRow, TextInput } from '@jumaah/admin';
import { Modal } from '@jumaah/admin';
import { Card, PageHeader } from '@jumaah/admin';
import { useToast } from '@jumaah/admin';
import { fmtDateTime } from '@jumaah/admin';
import { clean, validate } from '@jumaah/admin';

interface FeaturesDto {
  plan: SubscriptionPlan;
  features: PlanFeatures;
}

/** API keys, webhooks and a short how-to (plans with the `api` feature). */
export function ApiPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const features = useQuery({ queryKey: ['tenant', 'features', tenantId], queryFn: () => api.get<FeaturesDto>('/tenant/features') });
  const allowed = !!features.data?.features.api;
  const base = `${window.location.origin}/api`;

  return (
    <div>
      <PageHeader title={t('api.title')} subtitle={t('api.hint')} />
      {features.isLoading && <Spinner />}
      {features.data && !allowed && <EmptyState title={t('api.locked')} hint={t('branding.locked', { plan: t(`tenants.plans.${features.data.plan}`) })} />}
      {allowed && (
        <div className="flex flex-col gap-4">
          <KeysCard />
          <WebhooksCard />
          <Card title={t('api.docsTitle')}>
            <div className="flex flex-col gap-2 text-sm">
              <div>{t('api.docsAuth')}</div>
              <pre className="overflow-x-auto rounded-lg p-3 text-xs" dir="ltr" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
                {`curl ${base}/khutbahs \\\n  -H "Authorization: Bearer jk_..."`}
              </pre>
              <div>{t('api.docsEndpoints')}</div>
              <ul className="j-muted list-disc ps-5 text-xs" dir="ltr">
                <li>GET /api/tenant · GET /api/khutbahs · GET /api/khutbahs/:id · POST /api/khutbahs</li>
                <li>PUT /api/khutbahs/:id/sections/:type · POST /api/khutbahs/:id/translate · POST /api/khutbahs/:id/approve-all</li>
                <li>GET /api/session · POST /api/session/start · POST /api/session/command · POST /api/session/end</li>
                <li>GET /api/displays · GET /api/insight · GET /api/glossary</li>
              </ul>
              <div>{t('api.docsWebhooks')}</div>
              <pre className="overflow-x-auto rounded-lg p-3 text-xs" dir="ltr" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
                {`POST <your url>\nX-Jumaah-Event: khutbah.created\nX-Jumaah-Delivery: <uuid>\nX-Jumaah-Signature: sha256=HMAC_SHA256(secret, raw body)\n\n{ "id": "...", "event": "khutbah.created", "createdAt": "...", "tenantId": "...", "data": { ... } }`}
              </pre>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function KeysCard() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['api-keys', tenantId], queryFn: () => api.get<ApiKeyDto[]>('/api-keys') });
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<(ApiKeyDto & { key: string }) | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['api-keys'] });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post<ApiKeyDto & { key: string }>('/api-keys', body),
    onSuccess: (data) => {
      setCreated(data);
      setName('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/api-keys/${id}`), onSuccess: refresh, onError: (e) => toast.error(e) });
  const submit = () => {
    const v = validate(createApiKeySchema, clean({ name: name.trim(), readOnly }));
    setErrors(v.errors);
    if (v.ok) create.mutate(v.data);
  };

  return (
    <Card title={t('api.keys')}>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label={t('api.keyName')} error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('api.keyNamePlaceholder')} className="w-64" />
        </Field>
        <div className="pb-2">
          <Checkbox label={t('api.readOnly')} checked={readOnly} onChange={setReadOnly} />
        </div>
        <Button variant="primary" onClick={submit} disabled={create.isPending}>
          {create.isPending ? <Spinner /> : t('api.createKey')}
        </Button>
      </div>
      {keys.isLoading && <Spinner />}
      {keys.data && keys.data.length === 0 && <div className="j-muted text-sm">{t('api.noKeys')}</div>}
      {keys.data && keys.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="j-muted text-xs">
                <th className="py-1 text-start font-semibold">{t('api.keyName')}</th>
                <th className="py-1 text-start font-semibold">{t('api.prefix')}</th>
                <th className="py-1 text-start font-semibold">{t('api.scope')}</th>
                <th className="py-1 text-start font-semibold">{t('api.lastUsed')}</th>
                <th className="py-1 text-end font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid var(--j-border)', opacity: k.revokedAt ? 0.5 : 1 }}>
                  <td className="py-1.5">{k.name}</td>
                  <td className="py-1.5 font-mono text-xs" dir="ltr">
                    {k.prefix}…
                  </td>
                  <td className="py-1.5">
                    <StatusPill tone={k.readOnly ? 'muted' : 'warn'}>{k.readOnly ? t('api.readOnly') : t('api.readWrite')}</StatusPill>
                  </td>
                  <td className="py-1.5 text-xs">{k.revokedAt ? `${t('api.revoked')} · ${fmtDateTime(k.revokedAt)}` : k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t('api.neverUsed')}</td>
                  <td className="py-1.5 text-end">
                    {!k.revokedAt && (
                      <Button variant="danger" className="px-2 py-0.5 text-xs" onClick={() => revoke.mutate(k.id)}>
                        {t('api.revoke')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!created} onClose={() => setCreated(null)} title={t('api.keyCreated')} footer={<Button onClick={() => setCreated(null)}>{t('common.close')}</Button>}>
        <div className="flex flex-col gap-2 text-sm">
          <div>{t('api.keyOnce')}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded px-2 py-1 text-xs" dir="ltr" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
              {created?.key}
            </code>
            {created && <CopyButton text={created.key} />}
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function WebhooksCard() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const hooks = useQuery({ queryKey: ['webhooks', tenantId], queryFn: () => api.get<WebhookDto[]>('/webhooks') });
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['khutbah.created', 'session.started', 'session.ended']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const refresh = () => void qc.invalidateQueries({ queryKey: ['webhooks'] });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post<WebhookDto & { secret: string }>('/webhooks', body),
    onSuccess: (data) => {
      setSecret(data.secret);
      setName('');
      setUrl('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const toggle = useMutation({ mutationFn: (h: WebhookDto) => api.patch(`/webhooks/${h.id}`, { enabled: !h.enabled }), onSuccess: refresh, onError: (e) => toast.error(e) });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/webhooks/${id}`), onSuccess: refresh, onError: (e) => toast.error(e) });
  const test = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; status: number | null; error: string | null; durationMs: number }>(`/webhooks/${id}/test`).then((r) => ({ id, r })),
    onSuccess: ({ id, r }) => {
      setTestResult((m) => ({ ...m, [id]: r.ok ? `${t('api.testOk')} (${r.status}, ${r.durationMs} ms)` : `${t('api.testFailed')}: ${r.error ?? r.status}` }));
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(createWebhookSchema, clean({ name: name.trim(), url: url.trim(), events, enabled: true }));
    setErrors(v.errors);
    if (v.ok) create.mutate(v.data);
  };
  const flip = (e: WebhookEvent) => setEvents((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]));

  return (
    <Card title={t('api.webhooks')}>
      <div className="j-muted mb-3 text-sm">{t('api.webhooksHint')}</div>
      <FormRow cols={2}>
        <Field label={t('api.webhookName')} error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('api.webhookUrl')} error={errors.url}>
          <TextInput dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.org/jumaah" />
        </Field>
      </FormRow>
      <div className="mt-2 flex flex-wrap gap-3">
        {WEBHOOK_EVENTS.filter((e) => e !== 'ping').map((e) => (
          <Checkbox key={e} label={<span dir="ltr">{e}</span>} checked={events.includes(e)} onChange={() => flip(e)} />
        ))}
      </div>
      {errors.events && <div className="mt-1 text-xs" style={{ color: 'var(--j-danger)' }}>{errors.events}</div>}
      <div className="mt-3">
        <Button variant="primary" onClick={submit} disabled={create.isPending}>
          {create.isPending ? <Spinner /> : t('api.createWebhook')}
        </Button>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {hooks.isLoading && <Spinner />}
        {hooks.data && hooks.data.length === 0 && <div className="j-muted text-sm">{t('api.noWebhooks')}</div>}
        {hooks.data?.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm" style={{ border: '1px solid var(--j-border)', background: 'var(--j-bg)' }}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{h.name}</span>
                <StatusPill tone={h.enabled ? 'ok' : 'muted'}>{h.enabled ? t('common.enabled') : t('common.disabled')}</StatusPill>
                {h.lastStatus !== null && <StatusPill tone={h.lastStatus >= 200 && h.lastStatus < 300 ? 'ok' : 'danger'}>{h.lastStatus}</StatusPill>}
                {h.lastStatus === null && h.lastError && <StatusPill tone="danger">{h.lastError}</StatusPill>}
              </div>
              <div className="j-muted truncate text-xs" dir="ltr">
                {h.url}
              </div>
              <div className="j-muted text-xs" dir="ltr">
                {h.events.join(' · ')}
                {h.lastDeliveredAt ? ` · ${fmtDateTime(h.lastDeliveredAt)}` : ''}
              </div>
              {testResult[h.id] && <div className="mt-1 text-xs">{testResult[h.id]}</div>}
            </div>
            <div className="flex items-center gap-2">
              <Button className="px-2 py-1 text-xs" onClick={() => test.mutate(h.id)} disabled={test.isPending}>
                {t('api.test')}
              </Button>
              <Button className="px-2 py-1 text-xs" onClick={() => toggle.mutate(h)}>
                {h.enabled ? t('common.disable') : t('common.enable')}
              </Button>
              <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => remove.mutate(h.id)}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!secret} onClose={() => setSecret(null)} title={t('api.webhookCreated')} footer={<Button onClick={() => setSecret(null)}>{t('common.close')}</Button>}>
        <div className="flex flex-col gap-2 text-sm">
          <div>{t('api.secretOnce')}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded px-2 py-1 text-xs" dir="ltr" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
              {secret}
            </code>
            {secret && <CopyButton text={secret} />}
          </div>
        </div>
      </Modal>
    </Card>
  );
}
