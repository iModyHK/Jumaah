import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatSar, type Paginated, type PlatformBillingDto, type TenantDto } from '@jumaah/core';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { Field, Select, TextInput } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { fmtDate } from '../lib/format';
import { invoiceTone } from './BillingCard';

/** Super admin: open invoices, payments received, sponsorships to apply, and the billing run. */
export function PlatformBillingCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'billing'], queryFn: () => api.get<PlatformBillingDto>('/platform/billing'), refetchInterval: 60_000 });
  const tenants = useQuery({ queryKey: ['tenants', 'switcher'], queryFn: () => api.get<Paginated<TenantDto>>('/tenants', { pageSize: 200 }), staleTime: 60_000 });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState({ customer: '', description: '', amount: '', quantity: '1', dueDays: '14' });
  const createCustom = useMutation({
    mutationFn: () => {
      const [kind, id] = custom.customer.split(':');
      return api.post('/platform/invoices', { ...(kind === 'org' ? { organisationId: id } : { tenantId: id }), description: custom.description.trim(), quantity: Number(custom.quantity) || 1, unitPriceSar: Number(custom.amount), dueDays: Number(custom.dueDays) || 14 });
    },
    onSuccess: () => {
      toast.success(t('common.success'));
      setCustom({ customer: '', description: '', amount: '', quantity: '1', dueDays: '14' });
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['platform', 'billing'] });
  const run = <T,>(fn: () => Promise<T>) =>
    fn()
      .then(() => {
        toast.success(t('common.success'));
        refresh();
        void qc.invalidateQueries({ queryKey: ['tenants'] });
      })
      .catch((e) => toast.error(e));
  const billingRun = useMutation({
    mutationFn: () => api.post<{ issued: number; overdue: number; cancelled?: number; trialsEnded?: number; trialNotices?: number }>('/platform/billing/run'),
    onSuccess: (r) => {
      toast.success(t('billing.runDone', { issued: r.issued, overdue: r.overdue, cancelled: r.cancelled ?? 0, trialsEnded: r.trialsEnded ?? 0, trialNotices: r.trialNotices ?? 0 }));
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const d = q.data;
  const ar = i18n.language === 'ar';
  const money = (h: number) => `${formatSar(h, ar ? 'ar' : 'en')} ${t('billing.sar')}`;

  return (
    <Card
      title={t('billing.platformTitle')}
      className="mt-4"
      actions={
        <Button onClick={() => billingRun.mutate()} disabled={billingRun.isPending || !d?.applies}>
          {billingRun.isPending ? <Spinner /> : t('billing.runNow')}
        </Button>
      }
    >
      {q.isLoading && <Spinner />}
      {d && !d.applies && <div className="j-muted text-sm">{t('billing.notCloud')}</div>}
      {d && d.applies && (
        <div className="flex flex-col gap-4 text-sm">
          <div className="grid gap-2 md:grid-cols-4">
            <Mini label={t('billing.openTotal')} value={money(d.totals.openHalalas)} />
            <Mini label={`${t('billing.paidThisMonth')} · ${d.totals.month}`} value={money(d.totals.paidThisMonthHalalas)} />
            <Mini label={t('billing.provider')} value={d.seller.provider === 'moyasar' ? 'Moyasar' : t('billing.bankTransfer')} />
            <Mini label={t('billing.vatNumber')} value={d.seller.vatNumber ?? t('billing.notRegistered')} />
          </div>

          <div>
            <div className="j-label">{t('billing.openInvoices')}</div>
            {d.open.length === 0 && <div className="j-muted">{t('billing.noInvoices')}</div>}
            {d.open.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" style={{ borderTop: '1px solid var(--j-border)' }}>
                <div className="min-w-0">
                  <span className="font-mono text-xs" dir="ltr">
                    {inv.number}
                  </span>{' '}
                  <span>{inv.customerName}</span> <span className="j-muted text-xs">· {t(`billing.kinds.${inv.kind}`)} · {t('billing.due')} {fmtDate(inv.dueAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{money(inv.total)}</span>
                  <StatusPill tone={new Date(inv.dueAt) < new Date() ? 'danger' : 'warn'}>{new Date(inv.dueAt) < new Date() ? t('billing.overdue') : t('billing.statuses.OPEN')}</StatusPill>
                  <a href={inv.viewUrl} target="_blank" rel="noreferrer" className="j-btn px-2 py-0.5 text-xs">
                    {t('billing.view')}
                  </a>
                  <Button variant="primary" className="px-2 py-0.5 text-xs" onClick={() => void run(() => api.post(`/platform/invoices/${inv.id}/mark-paid`, {}))}>
                    {t('billing.markPaid')}
                  </Button>
                  <Button className="px-2 py-0.5 text-xs" onClick={() => void run(() => api.post(`/platform/invoices/${inv.id}/void`))}>
                    {t('billing.void')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="j-label">{t('billing.sponsorships')}</div>
            {d.sponsorships.length === 0 && <div className="j-muted">{t('billing.noSponsorships')}</div>}
            {d.sponsorships.map((s) => {
              const seatsLeft = s.mosques - s.applied.length;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" style={{ borderTop: '1px solid var(--j-border)' }}>
                  <div className="min-w-0">
                    <span className="font-semibold">{s.sponsorName}</span> <span className="j-muted text-xs" dir="ltr">{s.sponsorEmail}</span>
                    <div className="j-muted text-xs">
                      {t('billing.seats', { used: s.applied.length, total: s.mosques })}
                      {s.mosqueName ? ` · ${t('billing.requestedMosque')}: ${s.mosqueName}` : ''}
                      {s.invoice ? ` · ${s.invoice.number}` : ''}
                      {s.applied.length ? ` · ${s.applied.map((a) => a.tenantName).join(', ')}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={s.status === 'APPLIED' ? 'ok' : s.status === 'PAID' ? 'warn' : 'muted'}>{t(`billing.sponsorStatuses.${s.status}`)}</StatusPill>
                    {s.status === 'PAID' && seatsLeft > 0 && (
                      <>
                        <Select value={pick[s.id] ?? ''} onChange={(e) => setPick((m) => ({ ...m, [s.id]: e.target.value }))}>
                          <option value="">{t('billing.chooseMosque')}</option>
                          {tenants.data?.items.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name} ({x.slug})
                            </option>
                          ))}
                        </Select>
                        <Button variant="primary" className="px-2 py-0.5 text-xs" disabled={!pick[s.id]} onClick={() => void run(() => api.post(`/platform/sponsorships/${s.id}/apply`, { tenantId: pick[s.id] }))}>
                          {t('billing.apply')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
            <div className="j-label">{t('billing.customInvoice')}</div>
            <div className="j-muted mb-2 text-xs">{t('billing.customInvoiceHint')}</div>
            <div className="grid gap-2 md:grid-cols-5">
              <Field label={t('billing.customer')}>
                <Select value={custom.customer} onChange={(e) => setCustom((c) => ({ ...c, customer: e.target.value }))}>
                  <option value="">—</option>
                  {tenants.data?.items.map((x) => (
                    <option key={x.id} value={`tenant:${x.id}`}>
                      {x.name} ({x.slug})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('billing.description')}>
                <TextInput value={custom.description} onChange={(e) => setCustom((c) => ({ ...c, description: e.target.value }))} placeholder="Bulk contract, 30 mosques, one year" />
              </Field>
              <Field label={t('billing.quantity')}>
                <TextInput type="number" dir="ltr" value={custom.quantity} onChange={(e) => setCustom((c) => ({ ...c, quantity: e.target.value }))} />
              </Field>
              <Field label={t('billing.unitPrice')}>
                <TextInput type="number" dir="ltr" value={custom.amount} onChange={(e) => setCustom((c) => ({ ...c, amount: e.target.value }))} placeholder="1788" />
              </Field>
              <Field label={t('billing.dueDays')}>
                <TextInput type="number" dir="ltr" value={custom.dueDays} onChange={(e) => setCustom((c) => ({ ...c, dueDays: e.target.value }))} />
              </Field>
            </div>
            <Button variant="primary" className="mt-2" onClick={() => createCustom.mutate()} disabled={createCustom.isPending || !custom.customer || !custom.description.trim() || !custom.amount}>
              {createCustom.isPending ? <Spinner /> : t('billing.issue')}
            </Button>
          </div>

          {d.recentPaid.length > 0 && (
            <div>
              <div className="j-label">{t('billing.recentPaid')}</div>
              {d.recentPaid.slice(0, 10).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 py-1 text-xs" style={{ borderTop: '1px solid var(--j-border)' }}>
                  <span>
                    <span className="font-mono" dir="ltr">
                      {inv.number}
                    </span>{' '}
                    {inv.customerName} · {fmtDate(inv.paidAt)}
                  </span>
                  <span className="tabular-nums">
                    {money(inv.total)} <StatusPill tone={invoiceTone(inv.status)}>{t('billing.statuses.PAID')}</StatusPill>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
      <div className="j-muted text-xs">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
