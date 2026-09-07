import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTenantSchema, updateTenantSchema, type Paginated, type TenantDto } from '@jumaah/core';
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
import { useExtensions } from '../extensions';
import { clean, validate } from '../lib/forms';

const PAGE_SIZE = 25;

/** The create response: the mosque, the generated admin password, and any one-time secrets an extension adds. */
interface CreateResult {
  tenant: TenantDto;
  adminPassword?: string;
  [secret: string]: unknown;
}

export function TenantsPage() {
  const { t } = useTranslation();
  const { setTenantId } = useAuth();
  const ext = useExtensions();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [editing, setEditing] = useState<TenantDto | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<TenantDto | null>(null);
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
  const ExtCell = ext.tenants.cell?.Component;
  const ExtActions = ext.tenants.actions;
  const extraSecrets = created ? Object.entries(created).filter(([k, v]) => k !== 'tenant' && k !== 'adminPassword' && typeof v === 'string') : [];

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
                {!x.isActive && (
                  <div className="mt-1">
                    <StatusPill tone="danger">{t('tenants.suspended')}</StatusPill>
                  </div>
                )}
              </div>
            ),
          },
          ...(ExtCell && ext.tenants.cell ? [{ key: 'ext', header: t(ext.tenants.cell.header), render: (x: TenantDto) => <ExtCell tenant={x} /> }] : []),
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
                {ExtActions && <ExtActions tenant={x} onChanged={() => void invalidate()} />}
                <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setSuspendTarget(x)} disabled={!x.isActive}>
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
            {(created.adminPassword || extraSecrets.length > 0) && (
              <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(245,165,36,0.12)', color: 'var(--j-warn)' }}>
                {t('tenants.credentialsOnce')}
              </div>
            )}
            {extraSecrets.map(([k, v]) => (
              <div key={k}>
                <div className="j-label">{t(`tenants.${k}`, { defaultValue: k })}</div>
                <CopyField value={String(v)} />
              </div>
            ))}
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
  const ext = useExtensions();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Riyadh');
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [languages, setLanguages] = useState<string[]>(['en', 'ur']);
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ExtraFields = ext.tenants.createFields;

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
    const v = validate(createTenantSchema, clean({ name: name.trim(), slug: slug.trim(), timezone: timezone.trim(), locale, adminEmail: adminEmail.trim().toLowerCase(), adminName: adminName.trim(), adminPassword, languages }));
    setErrors(v.errors);
    if (v.ok) create.mutate({ ...v.data, ...extra });
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
          {ExtraFields && <ExtraFields value={extra} onChange={(patch) => setExtra((x) => ({ ...x, ...patch }))} errors={errors} />}
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
  const [sharing, setSharing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState<string | null>(null);
  if (tenant && key !== tenant.id) {
    setKey(tenant.id);
    setName(tenant.name);
    setTimezone(tenant.timezone);
    setLocale(tenant.locale);
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
    const v = validate(updateTenantSchema, { name: name.trim(), timezone: timezone.trim(), locale, librarySharingAllowed: sharing });
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
        <Checkbox label={t('tenants.librarySharing')} checked={sharing} onChange={setSharing} />
      </div>
    </Modal>
  );
}
