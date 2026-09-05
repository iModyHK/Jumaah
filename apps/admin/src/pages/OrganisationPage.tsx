import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { OrganisationDto } from '@jumaah/shared';
import { Button, EmptyState, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Card, PageHeader } from '../components/PageHeader';
import { fmtDate } from '../lib/format';

/** The organisation admin's own organisation: every member mosque, and a button to manage each one. */
export function OrganisationPage() {
  const { t } = useTranslation();
  const { user, tenantId, setTenantId } = useAuth();
  const navigate = useNavigate();
  const org = useQuery({ queryKey: ['organisation', user?.organisationId], queryFn: () => api.get<OrganisationDto>('/organisation'), enabled: !!user?.organisationId });

  if (!user?.organisationId) return <EmptyState title={t('organisation.notMember')} />;
  if (org.isLoading) return <Spinner />;
  if (!org.data) return <EmptyState title={t('errors.NOT_FOUND')} />;
  const o = org.data;

  return (
    <div>
      <PageHeader title={o.name} subtitle={t('organisation.ofMax', { count: o.tenants.length, max: o.maxTenants })} />
      <Card title={t('organisation.mosques')}>
        <div className="flex flex-col gap-2">
          {o.tenants.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3" style={{ border: '1px solid var(--j-border)', background: m.id === tenantId ? 'var(--j-accent-soft)' : 'var(--j-bg)' }}>
              <div className="min-w-0">
                <div className="font-semibold">{m.name}</div>
                <div className="j-muted text-xs" dir="ltr">
                  {m.customDomain ?? m.slug}
                  {m.subscriptionEndsAt ? ` · ${t('tenants.subscriptionEndsAt')}: ${fmtDate(m.subscriptionEndsAt)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={m.subscriptionStatus === 'ACTIVE' ? 'ok' : m.subscriptionStatus === 'SUSPENDED' ? 'danger' : 'warn'}>{t(`tenants.subscriptionStatus.${m.subscriptionStatus}`)}</StatusPill>
                <Button
                  variant={m.id === tenantId ? 'default' : 'primary'}
                  className="px-3 py-1 text-sm"
                  disabled={m.id === tenantId}
                  onClick={() => {
                    setTenantId(m.id);
                    navigate('/');
                  }}
                >
                  {m.id === tenantId ? t('organisation.current') : t('organisation.manage')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
