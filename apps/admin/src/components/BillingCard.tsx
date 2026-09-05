import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BILLING_CYCLES, SELF_SERVICE_PLANS, billingSettingsSchema, formatSar, type BillingCycle, type BillingOverviewDto, type InvoiceDto, type SubscriptionPlan, type TenantDto } from '@jumaah/shared';
import { Button, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Field, FormRow, Select, TextInput } from './Field';
import { Card } from './PageHeader';
import { useToast } from './Toast';
import { fmtDate } from '../lib/format';
import { clean, validate } from '../lib/forms';

export function invoiceTone(status: InvoiceDto['status']): 'ok' | 'warn' | 'muted' {
  return status === 'PAID' ? 'ok' : status === 'OPEN' ? 'warn' : 'muted';
}

/** Subscription, billing details, billing cycle and the mosque's invoices (hosted edition). */
export function BillingCard({ tenant }: { tenant: TenantDto }) {
  const { t, i18n } = useTranslation();
  const { tenantId } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const billing = useQuery({ queryKey: ['billing', tenantId], queryFn: () => api.get<BillingOverviewDto>('/billing') });
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [name, setName] = useState('');
  const [vat, setVat] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bank, setBank] = useState<string | null>(null);
  const [plan, setPlan] = useState<SubscriptionPlan>(SELF_SERVICE_PLANS.includes(tenant.plan as never) ? tenant.plan : 'STANDARD');
  const subscribe = useMutation({
    mutationFn: (body: { plan: SubscriptionPlan; cycle: BillingCycle }) => api.post<{ invoice: InvoiceDto; seller: BillingOverviewDto['seller'] }>('/billing/subscribe', body),
    onSuccess: ({ invoice }) => {
      toast.success(t('billing.subscribed', { number: invoice.number }));
      if (invoice.paymentUrl) window.open(invoice.paymentUrl, '_blank', 'noopener');
      else setBank(invoice.id);
      void qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(e),
  });
  useEffect(() => {
    const s = billing.data?.settings;
    if (!s) return;
    setCycle(s.cycle);
    setName(s.billingName ?? '');
    setVat(s.billingVatNumber ?? '');
    setAddress(s.billingAddress ?? '');
    setEmail(s.billingEmail ?? '');
  }, [billing.data?.settings]);

  const save = useMutation({
    mutationFn: (body: unknown) => api.put('/billing', body),
    onSuccess: () => {
      toast.success(t('common.success'));
      void qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(e),
  });
  const pay = useMutation({
    mutationFn: (id: string) => api.post<{ invoice: InvoiceDto; seller: BillingOverviewDto['seller'] }>(`/billing/invoices/${id}/pay`),
    onSuccess: ({ invoice, seller }) => {
      if (invoice.paymentUrl) window.open(invoice.paymentUrl, '_blank', 'noopener');
      else setBank(invoice.id === bank ? null : invoice.id);
      if (!invoice.paymentUrl && !seller.iban) toast.error(new Error(t('billing.noPaymentMethod')));
      void qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => toast.error(e),
  });
  const submit = () => {
    const v = validate(billingSettingsSchema, clean({ cycle, billingName: name.trim(), billingVatNumber: vat.trim(), billingAddress: address.trim(), billingEmail: email.trim() }));
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };

  const d = billing.data;
  const ar = i18n.language === 'ar';
  const money = (h: number) => `${formatSar(h, ar ? 'ar' : 'en')} ${t('billing.sar')}`;

  return (
    <Card
      title={t('settings.subscription')}
      actions={
        d?.applies ? (
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
        ) : undefined
      }
    >
      <dl className="grid gap-3 text-sm md:grid-cols-4">
        <div>
          <dt className="j-muted text-xs">{t('settings.plan')}</dt>
          <dd className="font-semibold">{t(`tenants.plans.${tenant.plan}`)}</dd>
        </div>
        <div>
          <dt className="j-muted text-xs">{t('common.status')}</dt>
          <dd className="font-semibold">{t(`tenants.subscriptionStatus.${tenant.subscriptionStatus}`)}</dd>
        </div>
        <div>
          <dt className="j-muted text-xs">{t('tenants.subscriptionEndsAt')}</dt>
          <dd>{fmtDate(tenant.subscriptionEndsAt)}</dd>
        </div>
        <div>
          <dt className="j-muted text-xs">{t('tenants.slug')}</dt>
          <dd>
            <code className="j-kbd">{tenant.slug}</code>
          </dd>
        </div>
      </dl>
      {billing.isLoading && <Spinner />}
      {d && d.applies && (
        <div className="mt-4 flex flex-col gap-4">
          {d.organisation && <div className="j-muted text-sm">{t('billing.viaOrganisation', { name: d.organisation.name })}</div>}
          <div>
            <div className="j-label">{t('billing.details')}</div>
            <FormRow cols={2}>
              <Field label={t('billing.cycle')} error={errors.cycle}>
                <Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
                  {BILLING_CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {t(`billing.cycles.${c}`, { price: formatSar(d.prices[tenant.plan] * (c === 'YEARLY' ? 10 : 1) * 100, ar ? 'ar' : 'en') })}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('billing.billingName')} error={errors.billingName}>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={tenant.name} />
              </Field>
              <Field label={t('billing.vatNumber')} error={errors.billingVatNumber}>
                <TextInput dir="ltr" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="3xxxxxxxxxxxxx3" />
              </Field>
              <Field label={t('billing.email')} error={errors.billingEmail}>
                <TextInput dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </FormRow>
            <Field label={t('billing.address')} error={errors.billingAddress}>
              <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <div className="j-muted mt-1 text-xs">{d.seller.vatRate > 0 ? t('billing.vatHint', { rate: Math.round(d.seller.vatRate * 100) }) : t('billing.noVatHint')}</div>
          </div>
          {!d.organisation && (
            <div className="rounded-lg p-3" style={{ border: '1px solid var(--j-border)' }}>
              <div className="j-label">{t('billing.subscribe')}</div>
              <div className="j-muted mb-2 text-xs">{t('billing.subscribeHint')}</div>
              <div className="flex flex-wrap items-end gap-2">
                <Field label={t('settings.plan')}>
                  <Select value={plan} onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}>
                    {SELF_SERVICE_PLANS.map((p) => (
                      <option key={p} value={p}>
                        {t(`tenants.plans.${p}`)} · {formatSar(d.prices[p] * 100, ar ? 'ar' : 'en')} {t('billing.sar')} {t('billing.perMonth')}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('billing.cycle')}>
                  <Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
                    {BILLING_CYCLES.map((c) => (
                      <option key={c} value={c}>
                        {t(`billing.cycleNames.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="primary" onClick={() => subscribe.mutate({ plan, cycle })} disabled={subscribe.isPending}>
                  {subscribe.isPending ? <Spinner /> : t('billing.subscribeNow', { total: formatSar(d.prices[plan] * (cycle === 'YEARLY' ? 10 : 1) * 100, ar ? 'ar' : 'en') })}
                </Button>
              </div>
            </div>
          )}
          <div>
            <div className="j-label">{t('billing.invoices')}</div>
            {d.invoices.length === 0 && <div className="j-muted text-sm">{t('billing.noInvoices')}</div>}
            {d.invoices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="j-muted text-xs">
                      <th className="py-1 text-start font-semibold">{t('billing.number')}</th>
                      <th className="py-1 text-start font-semibold">{t('billing.period')}</th>
                      <th className="py-1 text-end font-semibold">{t('billing.total')}</th>
                      <th className="py-1 text-start font-semibold">{t('common.status')}</th>
                      <th className="py-1 text-start font-semibold">{t('billing.due')}</th>
                      <th className="py-1 text-end font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.invoices.map((inv) => (
                      <tr key={inv.id} style={{ borderTop: '1px solid var(--j-border)' }}>
                        <td className="py-1.5 font-mono text-xs" dir="ltr">
                          {inv.number}
                        </td>
                        <td className="py-1.5 text-xs">{inv.periodStart ? `${fmtDate(inv.periodStart)} → ${fmtDate(inv.periodEnd)}` : t(`billing.kinds.${inv.kind}`)}</td>
                        <td className="py-1.5 text-end tabular-nums">{money(inv.total)}</td>
                        <td className="py-1.5">
                          <StatusPill tone={invoiceTone(inv.status)}>{t(`billing.statuses.${inv.status}`)}</StatusPill>
                        </td>
                        <td className="py-1.5 text-xs">{fmtDate(inv.dueAt)}</td>
                        <td className="py-1.5 text-end whitespace-nowrap">
                          <a href={inv.viewUrl} target="_blank" rel="noreferrer" className="j-btn px-2 py-0.5 text-xs">
                            {t('billing.view')}
                          </a>{' '}
                          {inv.status === 'OPEN' && (
                            <Button variant="primary" className="px-2 py-0.5 text-xs" onClick={() => pay.mutate(inv.id)} disabled={pay.isPending}>
                              {t('billing.pay')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bank && d.seller.iban && (
              <div className="mt-2 rounded-lg p-3 text-sm" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }} dir="ltr">
                <div className="j-label">{t('billing.bankTransfer')}</div>
                <div>
                  {d.seller.bank ?? ''} · IBAN {d.seller.iban} · {d.seller.name}
                </div>
                <div className="j-muted text-xs">{t('billing.bankHint')}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
