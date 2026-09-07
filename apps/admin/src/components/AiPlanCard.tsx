import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { PARAGRAPHS_PER_KHUTBAH_UNIT, type AiAllowanceDto } from '@jumaah/core';
import { StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Card } from './PageHeader';
import { fmtDate } from '../lib/format';

/** Hosted edition only: the mosque's plan, this month's platform-AI usage and why AI may be off. Renders nothing on self-hosted servers. */
export function AiPlanCard() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const q = useQuery({ queryKey: ['ai-usage', tenantId], queryFn: () => api.get<AiAllowanceDto>('/tenant/ai-usage'), staleTime: 30_000 });
  const a = q.data;
  if (!a || !a.applies) return null;

  const pct = a.monthlyParagraphs ? Math.min(100, Math.round((a.usedParagraphs / a.monthlyParagraphs) * 100)) : 0;
  const tone = !a.allowed ? 'danger' : a.state === 'grace' || pct >= 80 ? 'warn' : 'ok';
  const units = (n: number) => Math.round(n / PARAGRAPHS_PER_KHUTBAH_UNIT);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{t('plan.title')}</div>
          <div className="j-muted text-sm">
            {t(`tenants.plans.${a.plan}`)} · <StatusPill tone={tone}>{t(`plan.state.${a.state}`)}</StatusPill>
          </div>
        </div>
        <div className="text-sm">
          {a.endsAt && (
            <div>
              <span className="j-muted">{t('plan.renewal')}: </span>
              {fmtDate(a.endsAt)}
            </div>
          )}
          {a.state === 'grace' && a.graceEndsAt && <div style={{ color: 'var(--j-warn)' }}>{t('plan.grace', { date: fmtDate(a.graceEndsAt) })}</div>}
        </div>
      </div>

      {a.aiIncluded ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm">
            <span>{t('plan.usage')}</span>
            <span className="tabular-nums">
              {a.usedParagraphs} {t('plan.of')} {a.monthlyParagraphs ?? t('plan.unlimited')} {t('plan.paragraphs')}
              {a.monthlyParagraphs ? <span className="j-muted"> · {t('plan.approxKhutbahs', { used: units(a.usedParagraphs), total: units(a.monthlyParagraphs) })}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--j-border)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone === 'danger' ? 'var(--j-danger)' : tone === 'warn' ? 'var(--j-warn)' : 'var(--j-accent)' }} />
          </div>
          <div className="j-muted mt-1 text-xs">
            {t('plan.languages')}: {a.maxLanguages ?? t('plan.unlimited')} · {t('plan.month')}: {a.month}
          </div>
        </div>
      ) : null}

      {!a.allowed && a.reason && (
        <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(229,72,77,0.12)', color: 'var(--j-danger)' }}>
          {t(`plan.deny.${a.reason}`, { plan: t(`tenants.plans.${a.plan}`), count: a.maxLanguages ?? 0 })} {t('plan.manualHint')} {t('plan.contact')}
        </div>
      )}
    </Card>
  );
}
