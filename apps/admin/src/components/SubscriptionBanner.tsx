import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BillingOverviewDto } from '@jumaah/core';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { fmtDate } from '../lib/format';

const DAY = 24 * 60 * 60 * 1000;

/**
 * One line at the top of the dashboard about the subscription (hosted edition, admins only): trial days left,
 * an overdue invoice, a cancellation that is pending, or the free plan. Nothing on self-hosted servers.
 */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { tenantId, isAdmin } = useAuth();
  const q = useQuery({ queryKey: ['billing', tenantId], queryFn: () => api.get<BillingOverviewDto>('/billing'), enabled: isAdmin && !!tenantId, staleTime: 60_000 });
  const d = q.data;
  if (!d || !d.applies || d.organisation) return null;
  const { plan, status, endsAt } = d.subscription;
  const openInvoice = d.invoices.find((i) => i.status === 'OPEN');

  let tone: 'info' | 'warn' | 'danger' = 'info';
  let text: string;
  let action: { to: string; label: string } | null = { to: '/settings#billing', label: t('dashboard.subscription.subscribe') };
  if (status === 'PAST_DUE') {
    tone = 'danger';
    text = t('dashboard.subscription.pastDue', { number: openInvoice?.number ?? '' });
    action = { to: '/settings#billing', label: t('dashboard.subscription.pay') };
  } else if (status === 'TRIAL' && endsAt) {
    const days = Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / DAY));
    tone = days <= 7 ? 'warn' : 'info';
    text = t('dashboard.subscription.trial', { days, date: fmtDate(endsAt) });
  } else if (d.settings.cancelAtPeriodEnd && endsAt) {
    tone = 'warn';
    text = t('dashboard.subscription.cancelling', { date: fmtDate(endsAt) });
    action = { to: '/settings#billing', label: t('dashboard.subscription.keep') };
  } else if (plan === 'FREE') {
    text = t('dashboard.subscription.free');
  } else return null;

  const colour = tone === 'danger' ? 'var(--j-danger)' : tone === 'warn' ? 'var(--j-warn, #d97706)' : 'var(--j-primary)';
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${colour}`, background: 'color-mix(in srgb, ' + colour + ' 10%, transparent)' }} role="status">
      <span>{text}</span>
      {action && (
        <Link to={action.to} className="j-btn j-btn-primary px-3 py-1 text-xs">
          {action.label}
        </Link>
      )}
    </div>
  );
}
