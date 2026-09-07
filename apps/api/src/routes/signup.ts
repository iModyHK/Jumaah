import type { FastifyInstance } from 'fastify';
import { signupSchema, type SignupResultDto, type SlugCheckDto } from '@jumaah/core';
import { badRequest, forbidden } from '../lib/errors.js';
import { tenantBaseUrlFor } from '../lib/host.js';
import { parse } from '../lib/validate.js';
import { verifyTurnstile } from '../services/billing.service.js';
import { sendEmailLater } from '../services/email.service.js';
import { createTenantWithAdmin, slugProblem } from '../services/tenant.service.js';

/** Public sign-up of the hosted edition: the storefront on www.jumaah.net creates the mosque and its first admin here. */
export async function signupRoutes(app: FastifyInstance): Promise<void> {
  const { config } = app.ctx;

  /** Live check while the visitor types the address. */
  app.get('/public/signup/slug', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request): Promise<SlugCheckDto> => {
    const slug = String((request.query as { slug?: string }).slug ?? '')
      .trim()
      .toLowerCase();
    const reason = await slugProblem(app.ctx, slug);
    return { slug, available: reason === null, reason, address: config.tenantBaseDomain ? `${slug}.${config.tenantBaseDomain}` : null };
  });

  // Same budget as sign-in attempts (RATE_LIMIT_AUTH per minute and address).
  app.post('/public/signup', { config: { rateLimit: { max: config.RATE_LIMIT_AUTH, timeWindow: '1 minute' } } }, async (request, reply): Promise<SignupResultDto> => {
    if (!config.isCloud || !config.tenantBaseDomain) throw forbidden('Sign-up is only available on Jumaah Cloud');
    const body = parse(signupSchema, request.body);
    if (!(await verifyTurnstile(app.ctx, body.turnstileToken, request.ip))) throw badRequest('Verification failed', { code: 'captcha' });
    const { tenant } = await createTenantWithAdmin(
      app.ctx,
      { name: body.mosqueName, slug: body.slug, timezone: body.timezone, locale: body.locale, plan: body.plan, cycle: body.cycle, adminEmail: body.adminEmail, adminName: body.adminName, adminPassword: body.password, languages: body.languages },
      { id: null, email: body.adminEmail.toLowerCase(), ip: request.ip, userAgent: request.headers['user-agent'] ?? null },
      'tenant.signup',
    );
    const base = tenantBaseUrlFor(config, { slug: tenant.slug });
    const planLabel = { BASIC: 'Basic', STANDARD: 'Standard', PRO: 'Pro', ENTERPRISE: 'Organisation', FREE: 'Free' }[tenant.plan] ?? tenant.plan;
    sendEmailLater(app.ctx, { to: body.adminEmail, locale: body.locale, template: 'welcome', tenantId: tenant.id, data: { mosqueName: tenant.name, adminName: body.adminName, adminUrl: `${base}/admin/`, phoneUrl: `${base}/display/m/${tenant.slug}`, trialEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null, plan: planLabel } });
    reply.code(201);
    return { slug: tenant.slug, name: tenant.name, plan: tenant.plan, trialEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null, adminUrl: `${base}/admin/`, phoneUrl: `${base}/display/m/${tenant.slug}` };
  });
}
