import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArchiveSettings, PlanFeatures, SubscriptionPlan, TenantDto } from '@jumaah/core';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { CopyButton } from './CopyButton';
import { Checkbox } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';

interface FeaturesDto {
  plan: SubscriptionPlan;
  features: PlanFeatures;
}

/** Public archive of delivered khutbahs (paid editions): one switch, and the public link once it is on. */
export function ArchiveCard({ tenant }: { tenant: TenantDto }) {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const features = useQuery({ queryKey: ['tenant', 'features', tenantId], queryFn: () => api.get<FeaturesDto>('/tenant/features') });
  const stored = !!((tenant.settings as { archive?: ArchiveSettings }).archive?.enabled ?? false);
  const [enabled, setEnabled] = useState(stored);
  useEffect(() => setEnabled(stored), [tenant.id, stored]);

  const allowed = !!features.data?.features.archive;
  const plan = features.data?.plan ?? tenant.plan;
  const url = `${window.location.origin}/display/a/${encodeURIComponent(tenant.slug)}`;

  const save = useMutation({
    mutationFn: (on: boolean) => api.patch<TenantDto>('/tenant', { settings: { archive: { enabled: on } } }),
    onSuccess: (data) => {
      toast.success(t('common.success'));
      qc.setQueryData(['tenant', tenantId], data);
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card
      title={t('archive.title')}
      actions={
        <Button variant="primary" onClick={() => save.mutate(enabled)} disabled={save.isPending || (!allowed && enabled)}>
          {save.isPending ? <Spinner /> : t('common.save')}
        </Button>
      }
    >
      <div className="j-muted mb-3 text-sm">
        {t('archive.hint')}
        {!allowed && features.data && <span> · {t('branding.locked', { plan: t(`tenants.plans.${plan}`) })}</span>}
      </div>
      <Checkbox label={t('archive.enabled')} checked={enabled} disabled={!allowed && !enabled} onChange={setEnabled} />
      {stored && allowed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="j-label !mb-0">{t('archive.publicLink')}</span>
          <code className="rounded px-2 py-0.5" dir="ltr" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
            {url}
          </code>
          <CopyButton text={url} />
          <a href={url} target="_blank" rel="noreferrer" className="j-btn px-2 py-0.5 text-xs">
            {t('archive.open')}
          </a>
        </div>
      )}
    </Card>
  );
}
