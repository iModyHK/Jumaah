import type { FastifyInstance } from 'fastify';
import { applySponsorshipSchema, billingSettingsSchema, markPaidSchema, sponsorSchema, subscribeSchema, type BillingOverviewDto, type PlatformBillingDto, type PublicInvoiceDto, type SponsorResultDto } from '@jumaah/shared';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { idParam, parse } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { applySponsorship, createSponsorship, ensurePaymentUrl, invoiceDto, invoiceQr, markPaid, runBilling, sellerInfo, sponsorshipDto, subscribeNow, verifyTurnstile, voidInvoice } from '../services/billing.service.js';
import { verifyPayment } from '../services/payment.service.js';
import { actorOf } from './auth.js';
import { PLAN_PRICES_SAR } from '@jumaah/shared';

/** Billing: the mosque's invoices and details, the super admin's overview, the sponsor form and gateway callbacks. */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);
  const superOnly = app.requireRole('SUPER_ADMIN');

  // ---- Current mosque ----
  app.get('/billing', { preHandler: admin }, async (request): Promise<BillingOverviewDto> => {
    const t = await db.tenant.findUnique({ where: { id: request.tenantId }, include: { organisation: { select: { id: true, name: true } } } });
    if (!t) throw notFound('Tenant');
    const invoices = await db.invoice.findMany({ where: t.organisationId ? { OR: [{ tenantId: t.id }, { organisationId: t.organisationId }] } : { tenantId: t.id }, orderBy: { issuedAt: 'desc' }, take: 50 });
    return {
      applies: config.isCloud,
      seller: sellerInfo(config),
      prices: PLAN_PRICES_SAR,
      subscription: { plan: t.plan, status: t.subscriptionStatus, endsAt: t.subscriptionEndsAt?.toISOString() ?? null },
      organisation: t.organisation ? { id: t.organisation.id, name: t.organisation.name } : null,
      settings: { cycle: t.billingCycle, billingName: t.billingName, billingVatNumber: t.billingVatNumber, billingAddress: t.billingAddress, billingEmail: t.billingEmail },
      invoices: invoices.map((i) => invoiceDto(config, i)),
    };
  });

  app.put('/billing', { preHandler: admin }, async (request) => {
    const body = parse(billingSettingsSchema, request.body);
    const before = await db.tenant.findUnique({ where: { id: request.tenantId } });
    if (!before) throw notFound('Tenant');
    const t = await db.tenant.update({ where: { id: request.tenantId }, data: { billingCycle: body.cycle, billingName: body.billingName ?? null, billingVatNumber: body.billingVatNumber ?? null, billingAddress: body.billingAddress ?? null, billingEmail: body.billingEmail ?? null } });
    return { cycle: t.billingCycle, billingName: t.billingName, billingVatNumber: t.billingVatNumber, billingAddress: t.billingAddress, billingEmail: t.billingEmail };
  });

  /** Subscribe or change plan online: the invoice for the coming period, with a pay link when a gateway is configured. */
  app.post('/billing/subscribe', { preHandler: admin }, async (request, reply) => {
    if (!config.isCloud) throw forbidden('Subscriptions are handled by Jumaah Cloud');
    const body = parse(subscribeSchema, request.body);
    const inv = await subscribeNow(app.ctx, request.tenantId, body.plan, body.cycle, actorOf(request));
    reply.code(201);
    return { invoice: invoiceDto(config, inv), seller: sellerInfo(config) };
  });

  /** A pay link for one of the mosque's open invoices (or the bank details when payment is by transfer). */
  app.post('/billing/invoices/:id/pay', { preHandler: admin }, async (request) => {
    const id = idParam(request.params);
    const t = await db.tenant.findUnique({ where: { id: request.tenantId }, select: { organisationId: true } });
    const inv = await db.invoice.findFirst({ where: { id, OR: [{ tenantId: request.tenantId }, ...(t?.organisationId ? [{ organisationId: t.organisationId }] : [])] } });
    if (!inv) throw notFound('Invoice');
    if (inv.status !== 'OPEN') throw badRequest('Invoice is not open');
    const withUrl = await ensurePaymentUrl(app.ctx, inv);
    return { invoice: invoiceDto(config, withUrl), seller: sellerInfo(config) };
  });

  // ---- Super admin ----
  app.get('/platform/billing', { preHandler: superOnly }, async (): Promise<PlatformBillingDto> => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const include = { tenant: { select: { name: true, slug: true } }, organisation: { select: { name: true } } };
    const [open, paid, sponsorships, paidAgg, openAgg] = await Promise.all([
      db.invoice.findMany({ where: { status: 'OPEN' }, orderBy: { dueAt: 'asc' }, include, take: 200 }),
      db.invoice.findMany({ where: { status: 'PAID' }, orderBy: { paidAt: 'desc' }, include, take: 50 }),
      db.sponsorship.findMany({ orderBy: { createdAt: 'desc' }, include: { invoice: true }, take: 100 }),
      db.invoice.aggregate({ where: { status: 'PAID', paidAt: { gte: monthStart } }, _sum: { total: true } }),
      db.invoice.aggregate({ where: { status: 'OPEN' }, _sum: { total: true } }),
    ]);
    return {
      applies: config.isCloud,
      seller: sellerInfo(config),
      open: open.map((i) => invoiceDto(config, i)),
      recentPaid: paid.map((i) => invoiceDto(config, i)),
      sponsorships: sponsorships.map((s) => sponsorshipDto(s, config)),
      totals: { openHalalas: openAgg._sum.total ?? 0, paidThisMonthHalalas: paidAgg._sum.total ?? 0, month: monthStart.toISOString().slice(0, 7) },
    };
  });

  app.post('/platform/billing/run', { preHandler: superOnly }, async () => runBilling(app.ctx));

  app.post('/platform/invoices/:id/mark-paid', { preHandler: superOnly }, async (request) => {
    const body = parse(markPaidSchema, request.body ?? {});
    const inv = await markPaid(app.ctx, idParam(request.params), { provider: 'manual', reference: body.reference ?? null }, actorOf(request));
    return invoiceDto(config, inv);
  });

  app.post('/platform/invoices/:id/void', { preHandler: superOnly }, async (request) => invoiceDto(config, await voidInvoice(app.ctx, idParam(request.params), actorOf(request))));

  app.post('/platform/sponsorships/:id/apply', { preHandler: superOnly }, async (request) => {
    const { tenantId } = parse(applySponsorshipSchema, request.body);
    const s = await applySponsorship(app.ctx, idParam(request.params), tenantId, actorOf(request));
    const full = await db.sponsorship.findUniqueOrThrow({ where: { id: s.id }, include: { invoice: true } });
    return sponsorshipDto(full, config);
  });

  // ---- Public ----
  /** The sponsor page (www.jumaah.net) posts here: a sponsorship and its invoice, with a pay link or bank details. */
  app.post('/public/sponsor', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request, reply): Promise<SponsorResultDto> => {
    if (!config.isCloud) throw forbidden('Sponsorships are handled by Jumaah Cloud');
    const body = parse(sponsorSchema, request.body);
    if (!(await verifyTurnstile(config, body.turnstileToken, request.ip))) throw badRequest('Verification failed', { code: 'captcha' });
    const { invoice } = await createSponsorship(app.ctx, body);
    const dto = invoiceDto(config, invoice);
    reply.code(201);
    return { invoiceNumber: dto.number, total: dto.total, vat: dto.vat, currency: dto.currency, viewUrl: dto.viewUrl, paymentUrl: dto.paymentUrl, seller: sellerInfo(config) };
  });

  /** Anyone holding the invoice link (number + token) can view and print it. */
  app.get('/public/invoices/:number', async (request): Promise<PublicInvoiceDto> => {
    const number = idParam(request.params, 'number');
    const token = (request.query as { t?: string }).t;
    const inv = await db.invoice.findUnique({ where: { number }, include: { tenant: { select: { name: true, slug: true } }, organisation: { select: { name: true } } } });
    if (!inv || !token || token !== inv.accessToken) throw notFound('Invoice');
    return { invoice: invoiceDto(config, inv), seller: sellerInfo(config), qr: invoiceQr(config, inv) };
  });

  /** Moyasar sends the customer back here after paying; the state is confirmed with Moyasar before anything changes. */
  app.get('/public/billing/moyasar/callback', async (request, reply) => {
    const id = (request.query as { invoice?: string }).invoice;
    const inv = id ? await db.invoice.findUnique({ where: { id } }) : null;
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'OPEN' && inv.paymentProvider && inv.paymentRef) {
      const state = await verifyPayment(app.ctx, inv.paymentProvider, inv.paymentRef);
      if (state === 'paid') await markPaid(app.ctx, inv.id, { provider: inv.paymentProvider, reference: inv.paymentRef }, { id: null, email: 'moyasar:callback', ip: request.ip });
    }
    const fresh = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    return reply.redirect(`${invoiceDto(config, fresh).viewUrl}${fresh.status === 'PAID' ? '&paid=1' : ''}`);
  });

  /** Moyasar webhook: authenticated by the shared secret, then re-checked against Moyasar's API. */
  app.post('/public/billing/moyasar/webhook', async (request, reply) => {
    const body = (request.body ?? {}) as { secret_token?: string; data?: { id?: string; invoice_id?: string; metadata?: { jumaah_invoice?: string } } };
    if (!config.MOYASAR_WEBHOOK_SECRET || body.secret_token !== config.MOYASAR_WEBHOOK_SECRET) throw forbidden('Bad webhook secret');
    const ref = body.data?.invoice_id ?? body.data?.id;
    const ours = body.data?.metadata?.jumaah_invoice;
    const inv = ours ? await db.invoice.findUnique({ where: { id: ours } }) : ref ? await db.invoice.findFirst({ where: { paymentRef: ref } }) : null;
    if (!inv) return reply.code(200).send({ ok: true, ignored: true });
    if (inv.status === 'OPEN' && inv.paymentProvider && inv.paymentRef) {
      const state = await verifyPayment(app.ctx, inv.paymentProvider, inv.paymentRef);
      if (state === 'paid') await markPaid(app.ctx, inv.id, { provider: inv.paymentProvider, reference: inv.paymentRef }, { id: null, email: 'moyasar:webhook', ip: request.ip });
    }
    return { ok: true };
  });
}
