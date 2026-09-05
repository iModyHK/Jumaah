/**
 * Billing (hosted edition): renewal invoices for mosques and organisations, sponsor-a-mosque invoices, VAT, payment
 * state and the paid-until dates that follow from it. Nothing is ever deleted for non-payment: an overdue invoice
 * marks the mosque past due, which switches off platform AI after the grace period and nothing else.
 */
import type { Db, Invoice, Prisma, Sponsorship } from '@jumaah/db';
import { randomToken } from '@jumaah/db';
import {
  CURRENCY,
  INVOICE_DUE_DAYS,
  OVERDUE_GRACE_DAYS,
  RENEWAL_LEAD_DAYS,
  SPONSOR_PRICE_SAR,
  addCycle,
  addYears,
  computeTotals,
  priceFor,
  toHalalas,
  zatcaQr,
  type BillingCycle,
  type InvoiceDto,
  type InvoiceLine,
  type SellerInfoDto,
  type SponsorshipDto,
  type SubscriptionPlan,
} from '@jumaah/shared';
import type { Config } from '../config.js';
import { audit, type Actor } from '../lib/audit.js';
import type { AppContext } from '../lib/context.js';
import { conflict, notFound } from '../lib/errors.js';
import { createPayment } from './payment.service.js';

const DAY = 86_400_000;

export function sellerInfo(config: Config): SellerInfoDto {
  return {
    name: config.BILLING_SELLER_NAME,
    vatNumber: config.BILLING_VAT_NUMBER || null,
    address: config.BILLING_SELLER_ADDRESS || null,
    iban: config.BILLING_IBAN || null,
    bank: config.BILLING_BANK || null,
    vatRate: config.BILLING_VAT_RATE,
    currency: CURRENCY,
    provider: config.PAYMENT_PROVIDER === 'moyasar' && config.MOYASAR_SECRET_KEY ? 'moyasar' : 'manual',
  };
}

export function invoiceViewUrl(config: Config, inv: Pick<Invoice, 'number' | 'accessToken'>): string {
  return `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/display/invoice/${encodeURIComponent(inv.number)}?t=${inv.accessToken}`;
}

export function invoiceDto(config: Config, inv: Invoice & { tenant?: { name: string; slug: string } | null; organisation?: { name: string } | null }): InvoiceDto {
  return {
    id: inv.id,
    number: inv.number,
    kind: inv.kind,
    status: inv.status,
    tenantId: inv.tenantId,
    organisationId: inv.organisationId,
    sponsorshipId: inv.sponsorshipId,
    plan: inv.plan,
    cycle: inv.cycle,
    periodStart: inv.periodStart?.toISOString() ?? null,
    periodEnd: inv.periodEnd?.toISOString() ?? null,
    currency: inv.currency,
    subtotal: inv.subtotal,
    vatRate: inv.vatRate,
    vat: inv.vat,
    total: inv.total,
    lines: inv.lines as unknown as InvoiceLine[],
    billTo: inv.billTo as InvoiceDto['billTo'],
    issuedAt: inv.issuedAt.toISOString(),
    dueAt: inv.dueAt.toISOString(),
    paidAt: inv.paidAt?.toISOString() ?? null,
    paymentProvider: inv.paymentProvider,
    paymentUrl: inv.status === 'OPEN' ? inv.paymentUrl : null,
    viewUrl: invoiceViewUrl(config, inv),
    note: inv.note,
    customerName: inv.tenant?.name ?? inv.organisation?.name ?? (inv.billTo as { name?: string })?.name ?? null,
    customerSlug: inv.tenant?.slug ?? null,
  };
}

export function sponsorshipDto(s: Sponsorship & { invoice?: Invoice | null }, config: Config): SponsorshipDto {
  return {
    id: s.id,
    sponsorName: s.sponsorName,
    sponsorEmail: s.sponsorEmail,
    sponsorPhone: s.sponsorPhone,
    mosqueName: s.mosqueName,
    message: s.message,
    mosques: s.mosques,
    status: s.status,
    applied: (s.applied as Array<{ tenantId: string; tenantName: string; at: string }>) ?? [],
    lang: s.lang as 'ar' | 'en',
    createdAt: s.createdAt.toISOString(),
    invoice: s.invoice ? invoiceDto(config, s.invoice) : null,
  };
}

/** Sequential numbers per year: JC-2026-00001. Retries on the rare collision between two API processes. */
async function nextNumber(db: Db, year: number): Promise<string> {
  const prefix = `JC-${year}-`;
  const last = await db.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, '0')}`;
}

export interface CreateInvoiceInput {
  kind: 'SUBSCRIPTION' | 'SPONSORSHIP';
  tenantId?: string | null;
  organisationId?: string | null;
  sponsorshipId?: string | null;
  plan?: SubscriptionPlan | null;
  cycle?: BillingCycle | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  lines: InvoiceLine[];
  billTo: InvoiceDto['billTo'];
  dueAt?: Date;
  note?: string | null;
}

export async function createInvoice(ctx: AppContext, input: CreateInvoiceInput): Promise<Invoice> {
  const subtotal = input.lines.reduce((n, l) => n + l.amount, 0);
  const totals = computeTotals(subtotal, ctx.config.BILLING_VAT_RATE);
  const now = new Date();
  let created: Invoice | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const number = await nextNumber(ctx.db, now.getUTCFullYear());
    try {
      created = await ctx.db.invoice.create({
        data: {
          number,
          kind: input.kind,
          tenantId: input.tenantId ?? null,
          organisationId: input.organisationId ?? null,
          sponsorshipId: input.sponsorshipId ?? null,
          plan: input.plan ?? null,
          cycle: input.cycle ?? null,
          periodStart: input.periodStart ?? null,
          periodEnd: input.periodEnd ?? null,
          currency: CURRENCY,
          subtotal: totals.subtotal,
          vatRate: ctx.config.BILLING_VAT_RATE,
          vat: totals.vat,
          total: totals.total,
          lines: input.lines as unknown as Prisma.InputJsonValue,
          billTo: input.billTo as unknown as Prisma.InputJsonValue,
          accessToken: randomToken(18),
          dueAt: input.dueAt ?? new Date(now.getTime() + INVOICE_DUE_DAYS * DAY),
          note: input.note ?? null,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002' || attempt === 2) throw err;
    }
  }
  const inv = created!;
  // A pay link when a gateway is configured; failures are logged and retried when someone presses "Pay".
  try {
    const p = await createPayment(ctx, inv);
    if (p) return ctx.db.invoice.update({ where: { id: inv.id }, data: { paymentProvider: p.provider, paymentRef: p.ref, paymentUrl: p.url } });
  } catch (err) {
    ctx.log.warn({ err, invoice: inv.number }, 'payment link could not be created');
  }
  return inv;
}

/** Make sure an open invoice has a pay link (gateway configured); returns the invoice. */
export async function ensurePaymentUrl(ctx: AppContext, inv: Invoice): Promise<Invoice> {
  if (inv.status !== 'OPEN' || inv.paymentUrl) return inv;
  const p = await createPayment(ctx, inv);
  if (!p) return inv;
  return ctx.db.invoice.update({ where: { id: inv.id }, data: { paymentProvider: p.provider, paymentRef: p.ref, paymentUrl: p.url } });
}

export function subscriptionLines(plan: SubscriptionPlan, cycle: BillingCycle, start: Date, end: Date, mosques = 1): InvoiceLine[] {
  const period = `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`;
  const label = plan === 'ENTERPRISE' ? 'Organisation' : plan.charAt(0) + plan.slice(1).toLowerCase();
  const labelAr = { BASIC: 'الأساسية', STANDARD: 'القياسية', PRO: 'الاحترافية', ENTERPRISE: 'المؤسسة', FREE: 'المجانية' }[plan];
  const amount = priceFor(plan, cycle);
  return [
    {
      description: `Jumaah Cloud ${label} plan, ${cycle === 'YEARLY' ? 'one year' : 'one month'} (${period})${mosques > 1 ? `, ${mosques} mosques` : ''}`,
      descriptionAr: `جُمعة كلاود، الباقة ${labelAr}، ${cycle === 'YEARLY' ? 'سنة واحدة' : 'شهر واحد'} (${period})${mosques > 1 ? `، ${mosques} مساجد` : ''}`,
      quantity: 1,
      unitPrice: amount,
      amount,
    },
  ];
}

export function billToOf(t: { name: string; billingName: string | null; billingVatNumber: string | null; billingAddress: string | null; billingEmail: string | null }): InvoiceDto['billTo'] {
  return { name: t.billingName || t.name, vatNumber: t.billingVatNumber, address: t.billingAddress, email: t.billingEmail };
}

/**
 * Issue renewal invoices for every mosque (not in an organisation) and every organisation whose paid-until date is
 * within the lead window and has no open subscription invoice yet. Returns how many were issued.
 */
export async function issueRenewals(ctx: AppContext, now: Date = new Date()): Promise<number> {
  if (!ctx.config.isCloud) return 0;
  const horizon = new Date(now.getTime() + RENEWAL_LEAD_DAYS * DAY);
  let issued = 0;
  const tenants = await ctx.db.tenant.findMany({
    where: { isActive: true, organisationId: null, plan: { not: 'FREE' }, subscriptionStatus: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] }, subscriptionEndsAt: { not: null, lte: horizon } },
  });
  for (const t of tenants) {
    const open = await ctx.db.invoice.findFirst({ where: { tenantId: t.id, kind: 'SUBSCRIPTION', status: 'OPEN' } });
    if (open) continue;
    const start = t.subscriptionEndsAt! > now ? t.subscriptionEndsAt! : now;
    const end = addCycle(start, t.billingCycle);
    await createInvoice(ctx, { kind: 'SUBSCRIPTION', tenantId: t.id, plan: t.plan, cycle: t.billingCycle, periodStart: start, periodEnd: end, lines: subscriptionLines(t.plan, t.billingCycle, start, end), billTo: billToOf(t), dueAt: new Date(Math.max(start.getTime(), now.getTime() + INVOICE_DUE_DAYS * DAY)) });
    issued += 1;
  }
  const orgs = await ctx.db.organisation.findMany({ include: { tenants: { where: { isActive: true }, select: { subscriptionEndsAt: true, subscriptionStatus: true } } } });
  for (const o of orgs) {
    if (!o.tenants.length || o.tenants.every((t) => t.subscriptionStatus === 'SUSPENDED')) continue;
    const ends = o.tenants.map((t) => t.subscriptionEndsAt).filter((d): d is Date => !!d);
    if (!ends.length) continue;
    const earliest = new Date(Math.min(...ends.map((d) => d.getTime())));
    if (earliest > horizon) continue;
    const open = await ctx.db.invoice.findFirst({ where: { organisationId: o.id, kind: 'SUBSCRIPTION', status: 'OPEN' } });
    if (open) continue;
    const start = earliest > now ? earliest : now;
    const end = addCycle(start, o.billingCycle);
    await createInvoice(ctx, { kind: 'SUBSCRIPTION', organisationId: o.id, plan: 'ENTERPRISE', cycle: o.billingCycle, periodStart: start, periodEnd: end, lines: subscriptionLines('ENTERPRISE', o.billingCycle, start, end, o.tenants.length), billTo: billToOf(o), dueAt: new Date(Math.max(start.getTime(), now.getTime() + INVOICE_DUE_DAYS * DAY)) });
    issued += 1;
  }
  return issued;
}

/** Open subscription invoices past due plus grace: the mosque (or every mosque of the organisation) becomes past due. */
export async function markOverdue(ctx: AppContext, now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - OVERDUE_GRACE_DAYS * DAY);
  const overdue = await ctx.db.invoice.findMany({ where: { kind: 'SUBSCRIPTION', status: 'OPEN', dueAt: { lt: limit } } });
  let n = 0;
  for (const inv of overdue) {
    const where = inv.tenantId ? { id: inv.tenantId } : inv.organisationId ? { organisationId: inv.organisationId } : null;
    if (!where) continue;
    const res = await ctx.db.tenant.updateMany({ where: { ...where, subscriptionStatus: { in: ['ACTIVE', 'TRIAL'] } }, data: { subscriptionStatus: 'PAST_DUE' } });
    n += res.count;
  }
  return n;
}

/** Record a payment and extend the subscription (or unlock the sponsorship). Idempotent. */
export async function markPaid(ctx: AppContext, invoiceId: string, payment: { provider: string; reference: string | null }, actor: Actor): Promise<Invoice> {
  const inv = await ctx.db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'PAID') return inv;
  if (inv.status === 'VOID') throw conflict('Invoice is void');
  const paid = await ctx.db.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: new Date(), paymentProvider: payment.provider, paymentRef: payment.reference ?? inv.paymentRef } });
  if (inv.kind === 'SUBSCRIPTION' && inv.periodEnd) {
    const where = inv.tenantId ? { id: inv.tenantId } : inv.organisationId ? { organisationId: inv.organisationId } : null;
    if (where) {
      const members = await ctx.db.tenant.findMany({ where, select: { id: true, subscriptionEndsAt: true } });
      for (const m of members) {
        const ends = m.subscriptionEndsAt && m.subscriptionEndsAt > inv.periodEnd ? m.subscriptionEndsAt : inv.periodEnd;
        await ctx.db.tenant.update({ where: { id: m.id }, data: { subscriptionEndsAt: ends, subscriptionStatus: 'ACTIVE', ...(inv.plan ? { plan: inv.plan } : {}) } });
      }
    }
  }
  if (inv.kind === 'SPONSORSHIP' && inv.sponsorshipId) {
    await ctx.db.sponsorship.updateMany({ where: { id: inv.sponsorshipId, status: 'PENDING' }, data: { status: 'PAID' } });
  }
  await audit(ctx.db, inv.tenantId, actor, 'invoice.paid', 'Invoice', inv.id, { status: inv.status }, { status: 'PAID', provider: payment.provider, reference: payment.reference });
  return paid;
}

export async function voidInvoice(ctx: AppContext, invoiceId: string, actor: Actor): Promise<Invoice> {
  const inv = await ctx.db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound('Invoice');
  if (inv.status === 'PAID') throw conflict('A paid invoice cannot be voided');
  const v = await ctx.db.invoice.update({ where: { id: inv.id }, data: { status: 'VOID' } });
  await audit(ctx.db, inv.tenantId, actor, 'invoice.void', 'Invoice', inv.id, { status: inv.status }, { status: 'VOID' });
  return v;
}

/** A sponsor pays for one year of Standard for N mosques; the mosques are chosen later by the sponsor or by us. */
export async function createSponsorship(ctx: AppContext, input: { sponsorName: string; sponsorEmail: string; sponsorPhone?: string | null; mosqueName?: string | null; message?: string | null; mosques: number; lang: 'ar' | 'en' }): Promise<{ sponsorship: Sponsorship; invoice: Invoice }> {
  const sponsorship = await ctx.db.sponsorship.create({ data: { sponsorName: input.sponsorName, sponsorEmail: input.sponsorEmail.toLowerCase(), sponsorPhone: input.sponsorPhone ?? null, mosqueName: input.mosqueName ?? null, message: input.message ?? null, mosques: input.mosques, lang: input.lang, applied: [] } });
  const unit = toHalalas(SPONSOR_PRICE_SAR);
  const invoice = await createInvoice(ctx, {
    kind: 'SPONSORSHIP',
    sponsorshipId: sponsorship.id,
    lines: [{ description: 'Sponsor a mosque: one year of Jumaah Cloud Standard for one mosque', descriptionAr: 'رعاية مسجد: سنة من جُمعة كلاود (الباقة القياسية) لمسجد واحد', quantity: input.mosques, unitPrice: unit, amount: unit * input.mosques }],
    billTo: { name: input.sponsorName, email: input.sponsorEmail.toLowerCase(), vatNumber: null, address: null },
    note: input.mosqueName ? `Requested mosque: ${input.mosqueName}` : null,
  });
  return { sponsorship, invoice };
}

/** Apply one paid sponsorship seat to a mosque: a year of Standard from today (or from its current paid-until date). */
export async function applySponsorship(ctx: AppContext, sponsorshipId: string, tenantId: string, actor: Actor): Promise<Sponsorship> {
  const s = await ctx.db.sponsorship.findUnique({ where: { id: sponsorshipId } });
  if (!s) throw notFound('Sponsorship');
  if (s.status === 'PENDING') throw conflict('The sponsorship has not been paid yet');
  const applied = (s.applied as Array<{ tenantId: string; tenantName: string; at: string }>) ?? [];
  if (applied.length >= s.mosques) throw conflict('Every sponsored seat has been used');
  const t = await ctx.db.tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw notFound('Tenant');
  const now = new Date();
  const from = t.subscriptionEndsAt && t.subscriptionEndsAt > now ? t.subscriptionEndsAt : now;
  const rank: Record<string, number> = { FREE: 0, BASIC: 1, STANDARD: 2, PRO: 3, ENTERPRISE: 4 };
  await ctx.db.tenant.update({ where: { id: t.id }, data: { subscriptionEndsAt: addYears(from, 1), subscriptionStatus: 'ACTIVE', plan: (rank[t.plan] ?? 0) < 2 ? 'STANDARD' : t.plan } });
  const next = [...applied, { tenantId: t.id, tenantName: t.name, at: now.toISOString() }];
  const updated = await ctx.db.sponsorship.update({ where: { id: s.id }, data: { applied: next as unknown as Prisma.InputJsonValue, status: next.length >= s.mosques ? 'APPLIED' : 'PAID' } });
  await audit(ctx.db, t.id, actor, 'sponsorship.apply', 'Sponsorship', s.id, null, { tenantId: t.id, seat: next.length, of: s.mosques });
  return updated;
}

/**
 * The mosque subscribes (or changes plan) by itself: one invoice for the coming period, starting when the current paid
 * period ends or now (trial, lapsed). Any earlier open subscription invoice is replaced. The plan applies when paid.
 */
export async function subscribeNow(ctx: AppContext, tenantId: string, plan: SubscriptionPlan, cycle: BillingCycle, actor: Actor): Promise<Invoice> {
  const t = await ctx.db.tenant.findUnique({ where: { id: tenantId } });
  if (!t) throw notFound('Tenant');
  if (t.organisationId) throw conflict('This mosque is billed through its organisation');
  const now = new Date();
  const start = t.subscriptionStatus === 'ACTIVE' && t.subscriptionEndsAt && t.subscriptionEndsAt > now ? t.subscriptionEndsAt : now;
  const end = addCycle(start, cycle);
  const open = await ctx.db.invoice.findMany({ where: { tenantId, kind: 'SUBSCRIPTION', status: 'OPEN' } });
  for (const o of open) await ctx.db.invoice.update({ where: { id: o.id }, data: { status: 'VOID' } });
  await ctx.db.tenant.update({ where: { id: tenantId }, data: { billingCycle: cycle } });
  const inv = await createInvoice(ctx, { kind: 'SUBSCRIPTION', tenantId, plan, cycle, periodStart: start, periodEnd: end, lines: subscriptionLines(plan, cycle, start, end), billTo: billToOf(t), dueAt: new Date(Math.max(start.getTime(), now.getTime() + INVOICE_DUE_DAYS * DAY)) });
  await audit(ctx.db, tenantId, actor, 'billing.subscribe', 'Invoice', inv.id, { plan: t.plan, replaced: open.length }, { plan, cycle, number: inv.number });
  return inv;
}

export async function runBilling(ctx: AppContext, now: Date = new Date()): Promise<{ issued: number; overdue: number }> {
  if (!ctx.config.isCloud) return { issued: 0, overdue: 0 };
  const issued = await issueRenewals(ctx, now);
  const overdue = await markOverdue(ctx, now);
  if (issued || overdue) ctx.log.info({ issued, overdue }, 'billing run');
  return { issued, overdue };
}

/** Hosted edition: issue renewals and flag overdue invoices every few hours. */
export function startBillingScheduler(ctx: AppContext): void {
  if (!ctx.config.isCloud) return;
  const run = () => runBilling(ctx).catch((err) => ctx.log.error({ err }, 'billing run failed'));
  setTimeout(run, 30_000).unref();
  setInterval(run, ctx.config.BILLING_INTERVAL_MINUTES * 60_000).unref();
}

/** The QR printed on tax invoices once the seller has a VAT number. */
export function invoiceQr(config: Config, inv: Invoice): string | null {
  if (!config.BILLING_VAT_NUMBER) return null;
  return zatcaQr({ sellerName: config.BILLING_SELLER_NAME, vatNumber: config.BILLING_VAT_NUMBER, timestamp: inv.paidAt ?? inv.issuedAt, totalHalalas: inv.total, vatHalalas: inv.vat });
}

/** Turnstile check for public forms (the sponsor page); skipped when no secret is configured (self-hosted, tests). */
export async function verifyTurnstile(config: Config, token: string | undefined, ip: string | undefined, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!config.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const res = await fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: config.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
    });
    const body = (await res.json()) as { success?: boolean };
    return !!body.success;
  } catch {
    return false;
  }
}
