import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { providerConfigSchema, type ProviderConfigDto, type ProviderType } from '@jumaah/shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Checkbox, Field, FormRow, Select, TextInput } from '../components/Field';
import { Modal } from '../components/Modal';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { fmtDateTime } from '../lib/format';
import { clean, validate } from '../lib/forms';

interface ProvidersResponse {
  items: ProviderConfigDto[];
  chain: string[];
  cloudRelayAvailable: boolean;
}
interface ProviderTypeMeta {
  type: ProviderType;
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  defaultModel?: string;
  offline: boolean;
}
interface TestResult {
  ok: boolean;
  health: { ok: boolean; message?: string };
  sample: string | null;
  sampleError: string | null;
  latencyMs: number;
}
interface Draft {
  type: ProviderType;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  priority: string;
  enabled: boolean;
}
const EMPTY: Draft = { type: 'ANTHROPIC', name: '', apiKey: '', baseUrl: '', model: '', priority: '10', enabled: true };

export function ProvidersPage() {
  const { t } = useTranslation();
  const { tenantId, isSuper } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; global: boolean; draft: Draft } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProviderConfigDto | null>(null);
  const [testResult, setTestResult] = useState<{ provider: ProviderConfigDto; result: TestResult } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const data = useQuery({ queryKey: ['providers', tenantId], queryFn: () => api.get<ProvidersResponse>('/providers') });
  const types = useQuery({ queryKey: ['providers', 'types'], queryFn: () => api.get<ProviderTypeMeta[]>('/providers/types'), staleTime: Infinity });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['providers'] });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/providers/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const test = async (p: ProviderConfigDto) => {
    setTesting(p.id);
    try {
      const result = await api.post<TestResult>(`/providers/${p.id}/test`, {});
      setTestResult({ provider: p, result });
      void invalidate();
    } catch (err) {
      toast.error(err);
    } finally {
      setTesting(null);
    }
  };

  const items = data.data?.items ?? [];
  const tenantItems = items.filter((p) => !p.isGlobal);
  const globalItems = items.filter((p) => p.isGlobal);

  const openEdit = (p: ProviderConfigDto) =>
    setEditing({
      id: p.id,
      global: p.isGlobal,
      draft: { type: p.type, name: p.name, apiKey: '', baseUrl: p.baseUrl ?? '', model: p.model ?? '', priority: String(p.priority), enabled: p.enabled },
    });

  const renderList = (list: ProviderConfigDto[], editable: boolean) => (
    <div className="j-card overflow-x-auto">
      <table className="j-table">
        <thead>
          <tr>
            <th>{t('common.name')}</th>
            <th>{t('providers.type')}</th>
            <th>{t('providers.model')}</th>
            <th>{t('providers.priority')}</th>
            <th>{t('common.status')}</th>
            <th>{t('providers.lastTested')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={7} className="j-muted py-6 text-center">
                {t('providers.noProviders')}
              </td>
            </tr>
          )}
          {list.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-2 font-semibold">
                  {p.name}
                  {p.isGlobal && <StatusPill tone="muted">{t('providers.global')}</StatusPill>}
                </div>
                {p.hasApiKey && (
                  <div className="j-muted text-xs" dir="ltr">
                    {t('providers.apiKey')}: {p.apiKeyHint ?? '••••'}
                  </div>
                )}
              </td>
              <td>{t(`providers.types.${p.type}`)}</td>
              <td className="text-xs" dir="ltr">
                {p.model ?? p.baseUrl ?? '—'}
              </td>
              <td className="tabular-nums">{p.priority}</td>
              <td>
                <StatusPill tone={p.enabled ? 'ok' : 'muted'}>{p.enabled ? t('common.enabled') : t('common.disabled')}</StatusPill>
              </td>
              <td className="text-xs">
                {p.lastTestedAt ? (
                  <span style={{ color: p.lastTestOk ? 'var(--j-accent)' : 'var(--j-danger)' }}>
                    {p.lastTestOk ? t('providers.testOk') : t('providers.testFailed')} · {fmtDateTime(p.lastTestedAt)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="text-end">
                <div className="flex justify-end gap-1">
                  <Button className="px-2 py-1 text-xs" onClick={() => void test(p)} disabled={testing === p.id}>
                    {testing === p.id ? <Spinner /> : t('providers.test')}
                  </Button>
                  {editable && (
                    <>
                      <Button className="px-2 py-1 text-xs" onClick={() => openEdit(p)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(p)}>
                        {t('common.delete')}
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('providers.title')}
        actions={
          <Button variant="primary" onClick={() => setEditing({ id: null, global: false, draft: EMPTY })}>
            {t('providers.add')}
          </Button>
        }
      />
      {data.isLoading && <Spinner />}
      {data.data && (
        <div className="flex flex-col gap-6">
          {renderList(tenantItems, true)}
          {globalItems.length > 0 && !isSuper && (
            <div>
              <h2 className="mb-2 text-base font-semibold">{t('providers.platformProviders')}</h2>
              {renderList(globalItems, false)}
            </div>
          )}
          <ChainEditor chain={data.data.chain} providers={items} cloudRelayAvailable={data.data.cloudRelayAvailable} />
          {isSuper && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">{t('providers.platformProviders')}</h2>
                <Button onClick={() => setEditing({ id: null, global: true, draft: EMPTY })}>{t('providers.add')}</Button>
              </div>
              {renderList(globalItems, true)}
            </div>
          )}
        </div>
      )}

      <ProviderModal state={editing} types={types.data ?? []} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} danger message={t('common.areYouSure')} onConfirm={() => (deleteTarget ? del.mutateAsync(deleteTarget.id).then(() => undefined) : undefined)} />
      <Modal open={!!testResult} onClose={() => setTestResult(null)} title={`${t('providers.test')} — ${testResult?.provider.name ?? ''}`} footer={<Button onClick={() => setTestResult(null)}>{t('common.close')}</Button>}>
        {testResult && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2">
              <StatusPill tone={testResult.result.ok ? 'ok' : 'danger'}>{testResult.result.ok ? t('providers.testOk') : t('providers.testFailed')}</StatusPill>
              <span className="j-muted text-xs">{testResult.result.latencyMs} ms</span>
            </div>
            {testResult.result.health.message && <div dir="ltr">{testResult.result.health.message}</div>}
            {testResult.result.sample && (
              <div>
                <div className="j-label">{t('providers.sample')}</div>
                <div className="j-card p-3">{testResult.result.sample}</div>
              </div>
            )}
            {testResult.result.sampleError && (
              <div style={{ color: 'var(--j-danger)' }} dir="ltr">
                {testResult.result.sampleError}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ProviderModal({ state, types, onClose }: { state: { id: string | null; global: boolean; draft: Draft } | null; types: ProviderTypeMeta[]; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | undefined>(undefined);
  const stateKey = state ? `${state.id ?? 'new'}:${state.global}` : undefined;
  if (stateKey !== key) {
    setKey(stateKey);
    if (state) {
      setDraft(state.draft);
      setErrors({});
    }
  }
  const meta = types.find((x) => x.type === draft.type);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      state?.id ? api.patch<ProviderConfigDto>(`/providers/${state.id}`, body) : api.request<ProviderConfigDto>('/providers', { method: 'POST', body, query: state?.global ? { global: 1 } : undefined }),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['providers'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const body = clean({
      type: draft.type,
      name: draft.name.trim(),
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
      priority: draft.priority.trim() ? Number(draft.priority) : 10,
      enabled: draft.enabled,
    });
    const schema = state?.id ? providerConfigSchema.partial() : providerConfigSchema;
    const v = validate(schema, body);
    setErrors(v.errors);
    if (!v.ok) return;
    const out: Record<string, unknown> = { ...v.data };
    if (state?.id && !draft.apiKey.trim()) delete out.apiKey; // keep the stored key
    save.mutate(out);
  };
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={state?.id ? t('common.edit') : t('providers.add')}
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
          <Field label={t('providers.type')} error={errors.type}>
            <Select
              value={draft.type}
              disabled={!!state?.id}
              onChange={(e) => {
                const type = e.target.value as ProviderType;
                const m = types.find((x) => x.type === type);
                set({ type, model: m?.defaultModel ?? '', name: draft.name || t(`providers.types.${type}`) });
              }}
            >
              {types.map((x) => (
                <option key={x.type} value={x.type}>
                  {t(`providers.types.${x.type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.name')} error={errors.name}>
            <TextInput value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
        </FormRow>
        {(meta?.needsApiKey ?? true) && (
          <Field label={t('providers.apiKey')} error={errors.apiKey} hint={t('providers.apiKeyHint')}>
            <TextInput type="password" dir="ltr" autoComplete="off" value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} />
          </Field>
        )}
        {(meta?.needsBaseUrl ?? true) && (
          <Field label={t('providers.baseUrl')} error={errors.baseUrl}>
            <TextInput dir="ltr" value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="http://" />
          </Field>
        )}
        <FormRow>
          <Field label={t('providers.model')} error={errors.model}>
            <TextInput dir="ltr" value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder={meta?.defaultModel ?? ''} />
          </Field>
          <Field label={t('providers.priority')} error={errors.priority}>
            <TextInput type="number" min={0} max={100} dir="ltr" value={draft.priority} onChange={(e) => set({ priority: e.target.value })} />
          </Field>
        </FormRow>
        <Checkbox label={t('common.enabled')} checked={draft.enabled} onChange={(v) => set({ enabled: v })} />
      </div>
    </Modal>
  );
}

function ChainEditor({ chain, providers, cloudRelayAvailable }: { chain: string[]; providers: ProviderConfigDto[]; cloudRelayAvailable: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [local, setLocal] = useState<string[] | null>(null);
  const current = local ?? chain;
  const available = Array.from(new Set([...providers.filter((p) => p.enabled).map((p) => p.type), ...(cloudRelayAvailable ? ['CLOUD'] : [])])).filter((ty) => !current.includes(ty));

  const save = useMutation({
    mutationFn: (next: string[]) => api.put<{ chain: string[] }>('/providers/chain', { chain: next }),
    onSuccess: () => {
      toast.success(t('common.success'));
      setLocal(null);
      void qc.invalidateQueries({ queryKey: ['providers'] });
    },
    onError: (e) => toast.error(e),
  });

  const move = (i: number, dir: -1 | 1) => {
    const next = [...current];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setLocal(next);
  };

  return (
    <Card
      title={t('providers.chain')}
      actions={
        <Button variant="primary" onClick={() => save.mutate(current)} disabled={local === null || save.isPending}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </Button>
      }
    >
      <div className="j-muted mb-3 text-sm">{t('providers.chainHint')}</div>
      {cloudRelayAvailable && <div className="mb-2 text-xs" style={{ color: 'var(--j-accent)' }}>{t('providers.cloudRelay')}</div>}
      <ol className="flex flex-col gap-2">
        {current.map((ty, i) => (
          <li key={ty} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
            <span className="j-muted w-6 tabular-nums">{i + 1}.</span>
            <span className="flex-1 font-semibold">{t(`providers.types.${ty}`)}</span>
            <Button className="px-2 py-1 text-xs" onClick={() => move(i, -1)} disabled={i === 0}>
              ↑
            </Button>
            <Button className="px-2 py-1 text-xs" onClick={() => move(i, 1)} disabled={i === current.length - 1}>
              ↓
            </Button>
            <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setLocal(current.filter((x) => x !== ty))}>
              ✕
            </Button>
          </li>
        ))}
        {current.length === 0 && <li className="j-muted text-sm">{t('common.none')}</li>}
      </ol>
      {available.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="j-muted text-sm">{t('providers.addToChain')}</span>
          {available.map((ty) => (
            <Button key={ty} className="px-2 py-1 text-xs" onClick={() => setLocal([...current, ty])}>
              + {t(`providers.types.${ty}`)}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
