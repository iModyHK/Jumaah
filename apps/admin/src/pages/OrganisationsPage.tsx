import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createOrganisationSchema, ORG_MAX_TENANTS, type OrganisationDto, type Paginated, type TenantDto } from '@jumaah/shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { Field, FormRow, Select, TextInput } from '../components/Field';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { clean, validate } from '../lib/forms';

/** Super admin: organisation accounts, their mosques (up to the limit) and their admins. */
export function OrganisationsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const orgs = useQuery({ queryKey: ['organisations'], queryFn: () => api.get<OrganisationDto[]>('/organisations') });
  const tenants = useQuery({ queryKey: ['tenants', 'switcher'], queryFn: () => api.get<Paginated<TenantDto>>('/tenants', { pageSize: 200 }), staleTime: 60_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['organisations'] });
    void qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [maxTenants, setMax] = useState(String(ORG_MAX_TENANTS));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: (body: unknown) => api.post<OrganisationDto>('/organisations', body),
    onSuccess: () => {
      toast.success(t('common.success'));
      setName('');
      setSlug('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(createOrganisationSchema, clean({ name: name.trim(), slug: slug.trim().toLowerCase(), maxTenants: Number(maxTenants) }));
    setErrors(v.errors);
    if (v.ok) create.mutate(v.data);
  };

  return (
    <div>
      <PageHeader title={t('organisation.plural')} subtitle={t('organisation.pluralHint')} />
      <Card title={t('organisation.create')} className="mb-4">
        <FormRow cols={3}>
          <Field label={t('organisation.name')} error={errors.name}>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('tenants.slug')} error={errors.slug}>
            <TextInput dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="awqaf-riyadh" />
          </Field>
          <Field label={t('organisation.maxTenants')} error={errors.maxTenants}>
            <TextInput type="number" dir="ltr" value={maxTenants} onChange={(e) => setMax(e.target.value)} min={1} max={100} />
          </Field>
        </FormRow>
        <div className="mt-3">
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : t('common.create')}
          </Button>
        </div>
      </Card>
      {orgs.isLoading && <Spinner />}
      {orgs.data && orgs.data.length === 0 && <EmptyState title={t('organisation.empty')} />}
      <div className="flex flex-col gap-4">
        {orgs.data?.map((o) => (
          <OrganisationCard key={o.id} org={o} freeTenants={(tenants.data?.items ?? []).filter((x) => !x.organisationId)} onChanged={refresh} />
        ))}
      </div>
    </div>
  );
}

function OrganisationCard({ org, freeTenants, onChanged }: { org: OrganisationDto; freeTenants: TenantDto[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const run = <T,>(fn: () => Promise<T>, after?: () => void) =>
    fn()
      .then(() => {
        toast.success(t('common.success'));
        after?.();
        onChanged();
      })
      .catch((e) => toast.error(e));
  const full = org.tenants.length >= org.maxTenants;

  return (
    <Card
      title={
        <span>
          {org.name} <span className="j-muted text-sm font-normal">({org.slug})</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-2">
          <span className="j-muted text-xs">{t('organisation.ofMax', { count: org.tenants.length, max: org.maxTenants })}</span>
          <Button variant="danger" className="px-2 py-1 text-xs" disabled={org.tenants.length > 0} title={org.tenants.length > 0 ? t('organisation.deleteHint') : undefined} onClick={() => void run(() => api.delete(`/organisations/${org.id}`))}>
            {t('organisation.delete')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="j-label">{t('organisation.mosques')}</div>
          <div className="flex flex-col gap-1">
            {org.tenants.length === 0 && <div className="j-muted text-sm">—</div>}
            {org.tenants.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm" style={{ background: 'var(--j-bg)' }}>
                <span className="min-w-0 truncate">
                  {m.name} <span className="j-muted text-xs">({m.slug})</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={m.subscriptionStatus === 'ACTIVE' ? 'ok' : 'warn'}>{t(`tenants.plans.${m.plan}`)}</StatusPill>
                  <Button className="px-2 py-0.5 text-xs" onClick={() => void run(() => api.delete(`/organisations/${org.id}/tenants/${m.id}`))}>
                    {t('organisation.remove')}
                  </Button>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={full}>
              <option value="">{t('organisation.addMosque')}</option>
              {freeTenants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.slug})
                </option>
              ))}
            </Select>
            <Button className="px-3 py-1 text-sm" disabled={!tenantId || full} onClick={() => void run(() => api.post(`/organisations/${org.id}/tenants`, { tenantId }), () => setTenantId(''))}>
              {t('organisation.add')}
            </Button>
          </div>
        </div>
        <div>
          <div className="j-label">{t('organisation.admins')}</div>
          <div className="flex flex-col gap-1">
            {org.admins.length === 0 && <div className="j-muted text-sm">—</div>}
            {org.admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm" style={{ background: 'var(--j-bg)' }}>
                <span className="min-w-0 truncate">
                  {a.name} <span className="j-muted text-xs" dir="ltr">{a.email}</span>
                </span>
                <Button className="px-2 py-0.5 text-xs" onClick={() => void run(() => api.delete(`/organisations/${org.id}/admins/${a.id}`))}>
                  {t('organisation.remove')}
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TextInput dir="ltr" type="email" placeholder={t('organisation.addAdmin')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button className="px-3 py-1 text-sm" disabled={!email.trim()} onClick={() => void run(() => api.post(`/organisations/${org.id}/admins`, { email: email.trim().toLowerCase() }), () => setEmail(''))}>
              {t('organisation.add')}
            </Button>
          </div>
          <div className="j-muted mt-1 text-xs">{t('organisation.adminHint')}</div>
        </div>
      </div>
    </Card>
  );
}
