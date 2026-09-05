import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { InsightDto, PlanFeatures, SubscriptionPlan } from '@jumaah/shared';
import { Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { fmtDate, fmtDuration } from '../lib/format';
import { Card } from './PageHeader';

interface FeaturesDto {
  plan: SubscriptionPlan;
  features: PlanFeatures;
}

function Mini({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
      <div className="j-muted text-xs">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

/** Attendance insight (paid editions): how many screens and phones followed each khutbah. */
export function InsightCard() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const features = useQuery({ queryKey: ['tenant', 'features', tenantId], queryFn: () => api.get<FeaturesDto>('/tenant/features') });
  const allowed = !!features.data?.features.insight;
  const insight = useQuery({ queryKey: ['insight', tenantId], queryFn: () => api.get<InsightDto>('/insight'), enabled: allowed, staleTime: 60_000 });
  const s = insight.data?.summary;

  return (
    <Card title={t('insight.title')}>
      <div className="j-muted mb-3 text-sm">
        {t('insight.hint')}
        {!allowed && features.data && <span> · {t('branding.locked', { plan: t(`tenants.plans.${features.data.plan}`) })}</span>}
      </div>
      {allowed && insight.isLoading && <Spinner />}
      {allowed && insight.data && insight.data.sessions.length === 0 && <div className="j-muted text-sm">{t('insight.empty')}</div>}
      {allowed && insight.data && s && insight.data.sessions.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Mini label={t('insight.sessions')} value={s.sessions} />
            <Mini label={t('insight.avgPhones')} value={s.avgPhones} />
            <Mini label={t('insight.maxPhones')} value={s.maxPhones} />
            <Mini label={t('insight.avgDuration')} value={fmtDuration(s.avgDurationSec)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="j-muted text-start text-xs">
                  <th className="py-1 text-start font-semibold">{t('insight.colKhutbah')}</th>
                  <th className="py-1 text-start font-semibold">{t('insight.colDate')}</th>
                  <th className="py-1 text-end font-semibold">{t('insight.colDuration')}</th>
                  <th className="py-1 text-end font-semibold">{t('insight.colDisplays')}</th>
                  <th className="py-1 text-end font-semibold">{t('insight.colPhones')}</th>
                  <th className="py-1 text-end font-semibold">{t('insight.colUnique')}</th>
                </tr>
              </thead>
              <tbody>
                {insight.data.sessions.slice(0, 8).map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--j-border)' }}>
                    <td className="max-w-[16rem] truncate py-1.5" lang="ar" dir="rtl">
                      {r.title}
                    </td>
                    <td className="py-1.5 whitespace-nowrap">{fmtDate(r.gregorianDate)}</td>
                    <td className="py-1.5 text-end tabular-nums">{fmtDuration(r.durationSec)}</td>
                    <td className="py-1.5 text-end tabular-nums">{r.peakDisplays}</td>
                    <td className="py-1.5 text-end tabular-nums">{r.peakPhones}</td>
                    <td className="py-1.5 text-end tabular-nums">{r.uniquePhones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
