import type { FastifyInstance } from 'fastify';
import type { Tenant } from '@jumaah/cloud-db';
import { cloudCtx } from '../context.js';
import { signupSchema, type SignupResultDto, type SlugCheckDto } from '@jumaah/cloud-shared';
import { badRequest, forbidden } from '@jumaah/api';
import { tenantBaseUrlFor } from '../lib/host.js';
import { parse } from '@jumaah/api';
import { verifyTurnstile } from '../services/billing.service.js';
import { sendEmailLater } from '@jumaah/api';
import { createTenantWithAdmin, slugProblem } from '@jumaah/api';
import { coreCtx } from '../context.js';

/** Public sign-up of the hosted edition: the storefront on www.jumaah.net creates the mosque and its first admin here. */
export async function signupRoutes(app: FastifyInstance): Promise<void> {
  const ctx = cloudCtx(app.ctx);
  const { config } = ctx;

  /** Live check while the visitor types the address. */
  app.get('/public/signup/slug', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request): Promise<SlugCheckDto> => {
    const slug = String((request.query as { slug?: string }).slug ?? '')
      .trim()
      .toLowerCase();
    const reason = await slugProblem(coreCtx(ctx), slug);
    return { slug, available: reason === null, reason, address: config.tenantBaseDomain ? `${slug}.${config.tenantBaseDomain}` : null };
  });

  // Same budget as sign-in attempts (RATE_LIMIT_AUTH per minute and address).
  app.post('/public/signup', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request, reply): Promise<SignupResultDto> => {
    if (!config.isCloud || !config.tenantBaseDomain) throw forbidden('Sign-up is only available on Jumaah Cloud');
    const body = parse(signupSchema, request.body);
    if (!(await verifyTurnstile(ctx, body.turnstileToken, request.ip))) throw badRequest('Verification failed', { code: 'captcha' });
    const { tenant: created } = await createTenantWithAdmin(
      coreCtx(ctx),
      { name: body.mosqueName, slug: body.slug, timezone: body.timezone, locale: body.locale, plan: body.plan, cycle: body.cycle, adminEmail: body.adminEmail, adminName: body.adminName, adminPassword: body.password, languages: body.languages },
      { id: null, email: body.adminEmail.toLowerCase(), ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
      'tenant.signup',
    );
    // The core returns its own view of the row; on the cloud the row carries the plan columns as well.
    const tenant = created as unknown as Tenant;
    const base = tenantBaseUrlFor(config, { slug: tenant.slug });
    const planLabel = { BASIC: 'Basic', STANDARD: 'Standard', PRO: 'Pro', ENTERPRISE: 'Organisation', FREE: 'Free' }[tenant.plan] ?? tenant.plan;
    sendEmailLater(coreCtx(ctx), { to: body.adminEmail, locale: body.locale, template: 'welcome', tenantId: tenant.id, data: { mosqueName: tenant.name, adminName: body.adminName, adminUrl: `${base}/admin/`, phoneUrl: `${base}/display/m/${tenant.slug}`, trialEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null, plan: planLabel } });
    reply.code(201);
    return { slug: tenant.slug, name: tenant.name, plan: tenant.plan, trialEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null, adminUrl: `${base}/admin/`, phoneUrl: `${base}/display/m/${tenant.slug}` };
  });
}
