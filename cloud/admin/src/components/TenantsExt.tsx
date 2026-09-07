import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { TenantDto } from '@jumaah/core';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES, cloudTenantUpdateSchema, type SubscriptionPlan, type SubscriptionStatus } from '@jumaah/cloud-shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { ConfirmDialog, CopyField, Field, FormRow, Modal, Select, TextInput, api, fmtDate, useToast, validate } from '@jumaah/admin';
import { cloudTenant } from '../cloud-tenant';

/** Plan and subscription state in the mosques table. */
export function TenantPlanCell({ tenant }: { tenant: TenantDto }) {
  const { t } = useTranslation();
  const x = cloudTenant(tenant);
  return (
    <div className="flex flex-col gap-1">
      <span>{t(`tenants.plans.${x.plan}`)}</span>
      <StatusPill tone={x.subscriptionStatus === 'ACTIVE' ? 'ok' : x.subscriptionStatus === 'SUSPENDED' ? 'danger' : 'warn'}>{t(`tenants.subscriptionStatus.${x.subscriptionStatus}`)}</StatusPill>
      <span className="text-xs" style={x.subscriptionEndsAt && new Date(x.subscriptionEndsAt) < new Date() ? { color: 'var(--j-danger)' } : undefined}>
        {fmtDate(x.subscriptionEndsAt)}
      </span>
    </div>
  );
}

/** Plan picker in the create form (the API starts a trial of the chosen plan). */
export function TenantCreateFields({ value, onChange, errors }: { value: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void; errors: Record<string, string> }) {
  const { t } = useTranslation();
  return (
    <Field label={t('tenants.plan')} error={errors.plan}>
      <Select value={String(value.plan ?? 'STANDARD')} onChange={(e) => onChange({ plan: e.target.value })}>
        {SUBSCRIPTION_PLANS.map((p) => (
          <option key={p} value={p}>
            {t(`tenants.plans.${p}`)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Row actions of the hosted edition: the subscription dialog and the sync key. */
export function TenantActions({ tenant, onChanged }: { tenant: TenantDto; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [subOpen, setSubOpen] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const rotate = async () => {
    try {
      const r = await api.post<{ syncKey: string }>(`/tenants/${tenant.id}/sync-key`);
      setSecret(r.syncKey);
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };
  return (
    <>
      <Button className="px-2 py-1 text-xs" onClick={() => setSubOpen(true)}>
        {t('settings.subscription')}
      </Button>
      <Button className="px-2 py-1 text-xs" onClick={() => setRotateOpen(true)}>
        {t('tenants.rotateSyncKey')}
      </Button>
      <SubscriptionModal tenant={subOpen ? tenant : null} onClose={() => setSubOpen(false)} onSaved={onChanged} />
      <ConfirmDialog open={rotateOpen} onClose={() => setRotateOpen(false)} title={t('tenants.rotateSyncKey')} message={`${tenant.name} — ${t('common.areYouSure')}`} onConfirm={rotate} />
      <Modal open={!!secret} onClose={() => setSecret(null)} title={t('tenants.syncKey')} footer={<Button onClick={() => setSecret(null)}>{t('common.close')}</Button>}>
        {secret && (
          <div className="flex flex-col gap-3">
            <div className="j-muted text-sm">{t('tenants.credentialsOnce')}</div>
            <CopyField value={secret} />
          </div>
        )}
      </Modal>
    </>
  );
}

function SubscriptionModal({ tenant, onClose, onSaved }: { tenant: TenantDto | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE');
  const [status, setStatus] = useState<SubscriptionStatus>('TRIAL');
  const [endsAt, setEndsAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  if (tenant && key !== tenant.id) {
    const x = cloudTenant(tenant);
    setKey(tenant.id);
    setPlan(x.plan);
    setStatus(x.subscriptionStatus);
    setEndsAt(x.subscriptionEndsAt ? x.subscriptionEndsAt.slice(0, 10) : '');
    setErrors({});
  }
  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<TenantDto>(`/tenants/${tenant!.id}/subscription`, body),
    onSuccess: () => {
      toast.success(t('common.success'));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(cloudTenantUpdateSchema, { plan, subscriptionStatus: status, subscriptionEndsAt: endsAt ? new Date(`${endsAt}T00:00:00Z`).toISOString() : null });
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };
  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title={`${t('settings.subscription')} — ${tenant?.name ?? ''}`}
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
        <FormRow cols={3}>
          <Field label={t('tenants.plan')} error={errors.plan}>
            <Select value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
              {SUBSCRIPTION_PLANS.map((p) => (
                <option key={p} value={p}>
                  {t(`tenants.plans.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.status')} error={errors.subscriptionStatus}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)}>
              {SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`tenants.subscriptionStatus.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('tenants.subscriptionEndsAt')} error={errors.subscriptionEndsAt}>
            <TextInput type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </FormRow>
        <div className="j-muted text-xs">{t('tenants.paidUntilHint')}</div>
      </div>
    </Modal>
  );
}
