import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES, createTenantSchema, updateTenantSchema, type Paginated, type SubscriptionPlan, type SubscriptionStatus, type TenantDto } from '@jumaah/shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CopyField } from '../components/CopyButton';
import { DataTable } from '../components/DataTable';
import { Checkbox, Field, FormRow, Select, TextInput } from '../components/Field';
import { LanguagePicker } from '../components/LanguagePicker';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { Pagination } from '../components/Pagination';
import { useToast } from '../components/Toast';
import { fmtDate } from '../lib/format';
import { clean, validate } from '../lib/forms';

const PAGE_SIZE = 25;

interface CreateResult {
  tenant: TenantDto;
  syncKey: string;
  adminPassword?: string;
}

export function TenantsPage() {
  const { t } = useTranslation();
  const { setTenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<TenantDto | null>(null);
  const [rotateTarget, setRotateTarget] = useState<TenantDto | null>(null);
  const [secret, setSecret] = useState<{ title: string; value: string; hint: string } | null>(null);

  const list = useQuery({ queryKey: ['tenants', { q, page }], queryFn: () => api.get<Paginated<TenantDto>>('/tenants', { q, page, pageSize: PAGE_SIZE }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tenants'] });

  const suspend = useMutation({
    mutationFn: (id: string) => api.delete(`/tenants/${id}`),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const rotate = async (tenant: TenantDto) => {
    try {
      const r = await api.post<{ syncKey: string }>(`/tenants/${tenant.id}/sync-key`);
      setSecret({ title: t('tenants.syncKey'), value: r.syncKey, hint: t('tenants.credentialsOnce') });
    } catch (err) {
      toast.error(err);
      throw err;
    }
  };
  const impersonate = async (tenant: TenantDto) => {
    try {
      const r = await api.post<{ accessToken: string; expiresIn: number; tenant: TenantDto }>(`/tenants/${tenant.id}/impersonate`);
      setSecret({ title: `${t('tenants.impersonate')} — ${r.tenant.name}`, value: r.accessToken, hint: t('tenants.impersonateHint') });
    } catch (err) {
      toast.error(err);
    }
  };
  const open = (tenant: TenantDto) => {
    setTenantId(tenant.id);
    navigate('/');
  };

  return (
    <div>
      <PageHeader
        title={t('tenants.title')}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {t('tenants.add')}
          </Button>
        }
      />
      <div className="mb-4 max-w-sm">
        <TextInput
          placeholder={t('common.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <DataTable<TenantDto>
        loading={list.isLoading}
        rows={list.data?.items ?? []}
        rowKey={(x) => x.id}
        columns={[
          {
            key: 'name',
            header: t('common.name'),
            render: (x) => (
              <div>
                <div className="font-semibold">{x.name}</div>
                <code className="j-kbd text-xs">{x.slug}</code>
              </div>
            ),
          },
          {
            key: 'plan',
            header: t('tenants.plan'),
            render: (x) => (
              <div className="flex flex-col gap-1">
                <span>{t(`tenants.plans.${x.plan}`)}</span>
                <StatusPill tone={x.subscriptionStatus === 'ACTIVE' ? 'ok' : x.subscriptionStatus === 'SUSPENDED' ? 'danger' : 'warn'}>{t(`tenants.subscriptionStatus.${x.subscriptionStatus}`)}</StatusPill>
              </div>
            ),
          },
          { key: 'ends', header: t('tenants.subscriptionEndsAt'), render: (x) => <span className="text-xs">{fmtDate(x.subscriptionEndsAt)}</span> },
          {
            key: 'counts',
            header: t('common.total'),
            render: (x) => (
              <span className="j-muted text-xs">
                {t('nav.users')}: {x._count?.users ?? 0} · {t('nav.khutbahs')}: {x._count?.khutbahs ?? 0} · {t('nav.displays')}: {x._count?.displays ?? 0}
              </span>
            ),
          },
          {
            key: 'actions',
            header: t('common.actions'),
            className: 'text-end',
            render: (x) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button variant="primary" className="px-2 py-1 text-xs" onClick={() => open(x)}>
                  {t('common.open')}
                </Button>
                <Button className="px-2 py-1 text-xs" onClick={() => setEditing(x)}>
                  {t('common.edit')}
                </Button>
                <Button className="px-2 py-1 text-xs" onClick={() => void impersonate(x)}>
                  {t('tenants.impersonate')}
                </Button>
                <Button className="px-2 py-1 text-xs" onClick={() => setRotateTarget(x)}>
                  {t('tenants.rotateSyncKey')}
                </Button>
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setSuspendTarget(x)} disabled={x.subscriptionStatus === 'SUSPENDED'}>
                  {t('tenants.suspend')}
                </Button>
              </div>
            ),
          },
        ]}
      />
      <div className="mt-3">
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
      </div>

      <CreateTenantModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(r) => {
          setCreateOpen(false);
          setCreated(r);
          void invalidate();
        }}
      />
      <Modal open={!!created} onClose={() => setCreated(null)} title={created?.tenant.name ?? ''} footer={<Button onClick={() => setCreated(null)}>{t('common.close')}</Button>}>
        {created && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(245,165,36,0.12)', color: 'var(--j-warn)' }}>
              {t('tenants.credentialsOnce')}
            </div>
            <div>
              <div className="j-label">{t('tenants.syncKey')}</div>
              <CopyField value={created.syncKey} />
            </div>
            {created.adminPassword && (
              <div>
                <div className="j-label">{t('tenants.adminPassword')}</div>
                <CopyField value={created.adminPassword} />
              </div>
            )}
          </div>
        )}
      </Modal>
      <EditTenantModal tenant={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog open={!!suspendTarget} onClose={() => setSuspendTarget(null)} danger title={t('tenants.suspend')} message={`${suspendTarget?.name ?? ''} — ${t('common.areYouSure')}`} onConfirm={() => (suspendTarget ? suspend.mutateAsync(suspendTarget.id).then(() => undefined) : undefined)} />
      <ConfirmDialog open={!!rotateTarget} onClose={() => setRotateTarget(null)} title={t('tenants.rotateSyncKey')} message={`${rotateTarget?.name ?? ''} — ${t('common.areYouSure')}`} onConfirm={() => (rotateTarget ? rotate(rotateTarget) : undefined)} />
      <Modal open={!!secret} onClose={() => setSecret(null)} title={secret?.title ?? ''} footer={<Button onClick={() => setSecret(null)}>{t('common.close')}</Button>}>
        {secret && (
          <div className="flex flex-col gap-3">
            <div className="j-muted text-sm">{secret.hint}</div>
            <CopyField value={secret.value} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateTenantModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: CreateResult) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [languages, setLanguages] = useState<string[]>(['en', 'ur']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<CreateResult>('/tenants', body),
    onSuccess: (r) => {
      setName('');
      setSlug('');
      setAdminEmail('');
      setAdminName('');
      setAdminPassword('');
      onCreated(r);
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const v = validate(createTenantSchema, clean({ name: name.trim(), slug: slug.trim(), timezone: timezone.trim(), locale, plan, adminEmail: adminEmail.trim().toLowerCase(), adminName: adminName.trim(), adminPassword, languages }));
    setErrors(v.errors);
    if (v.ok) create.mutate(v.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tenants.add')}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormRow>
          <Field label={t('settings.mosqueName')} error={errors.name}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('tenants.slug')} error={errors.slug}>
            <TextInput dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="my-mosque" />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label={t('settings.timezone')} error={errors.timezone}>
            <TextInput dir="ltr" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
          <Field label={t('settings.locale')} error={errors.locale}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as 'ar' | 'en')}>
              <option value="ar">{t('common.arabic')}</option>
              <option value="en">{t('common.english')}</option>
            </Select>
          </Field>
          <Field label={t('tenants.plan')} error={errors.plan}>
            <Select value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
              {SUBSCRIPTION_PLANS.map((p) => (
                <option key={p} value={p}>
                  {t(`tenants.plans.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label={t('tenants.adminEmail')} error={errors.adminEmail}>
            <TextInput type="email" dir="ltr" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </Field>
          <Field label={t('tenants.adminName')} error={errors.adminName}>
            <TextInput value={adminName} onChange={(e) => setAdminName(e.target.value)} />
          </Field>
          <Field label={t('tenants.adminPassword')} error={errors.adminPassword} hint={t('common.optional')}>
            <TextInput type="password" autoComplete="new-password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          </Field>
        </FormRow>
        <Field label={t('settings.languages')} error={errors.languages}>
          <LanguagePicker value={languages} onChange={setLanguages} />
        </Field>
      </div>
    </Modal>
  );
}

function EditTenantModal({ tenant, onClose }: { tenant: TenantDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [plan, setPlan] = useState<SubscriptionPlan>('FREE');
  const [status, setStatus] = useState<SubscriptionStatus>('TRIAL');
  const [endsAt, setEndsAt] = useState('');
  const [sharing, setSharing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  if (tenant && key !== tenant.id) {
    setKey(tenant.id);
    setName(tenant.name);
    setTimezone(tenant.timezone);
    setLocale(tenant.locale);
    setPlan(tenant.plan);
    setStatus(tenant.subscriptionStatus);
    setEndsAt(tenant.subscriptionEndsAt ? tenant.subscriptionEndsAt.slice(0, 10) : '');
    setSharing(tenant.librarySharingAllowed);
    setErrors({});
  }
  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<TenantDto>(`/tenants/${tenant!.id}`, body),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(updateTenantSchema, {
      name: name.trim(),
      timezone: timezone.trim(),
      locale,
      plan,
      subscriptionStatus: status,
      subscriptionEndsAt: endsAt ? new Date(`${endsAt}T00:00:00Z`).toISOString() : null,
      librarySharingAllowed: sharing,
    });
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };
  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title={`${t('common.edit')} — ${tenant?.name ?? ''}`}
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
        <Field label={t('settings.mosqueName')} error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <FormRow>
          <Field label={t('settings.timezone')} error={errors.timezone}>
            <TextInput dir="ltr" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
          <Field label={t('settings.locale')} error={errors.locale}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as 'ar' | 'en')}>
              <option value="ar">{t('common.arabic')}</option>
              <option value="en">{t('common.english')}</option>
            </Select>
          </Field>
        </FormRow>
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
        <Checkbox label={t('tenants.librarySharing')} checked={sharing} onChange={setSharing} />
      </div>
    </Modal>
  );
}
