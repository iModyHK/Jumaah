import type { FastifyInstance } from 'fastify';
import { PLATFORM_CONFIG_GROUPS, platformGroupSchemas, testEmailSchema, type PlatformConfigGroup } from '@jumaah/core';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { sendEmail } from '../services/email.service.js';
import { moyasarCheckKey } from '../services/payment.service.js';
import { platformConfig, platformConfigDto, savePlatformGroup } from '../services/platform-config.service.js';
import { actorOf } from './auth.js';

/** Platform configuration in the portal (super admin): billing, payments, email, security. */
export async function platformConfigRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;
  const superOnly = app.requireRole('SUPER_ADMIN');

  app.get('/platform/config', { preHandler: superOnly }, async () => platformConfigDto(app.ctx));

  app.put('/platform/config/:group', { preHandler: superOnly }, async (request) => {
    const group = (request.params as { group: string }).group as PlatformConfigGroup;
    if (!PLATFORM_CONFIG_GROUPS.includes(group)) throw badRequest('Unknown settings group');
    const body = parse(platformGroupSchemas[group], request.body);
    await savePlatformGroup(app.ctx, group, body as Record<string, unknown>);
    const safe = Object.fromEntries(Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' && /secret|pass/i.test(k) ? (v ? '(set)' : v) : v]));
    await audit(db, null, actorOf(request), 'platform.config', 'PlatformSetting', group, null, safe);
    return platformConfigDto(app.ctx);
  });

  /** Send a test message with the current email settings. */
  app.post('/platform/config/email/test', { preHandler: superOnly }, async (request) => {
    const { to, locale } = parse(testEmailSchema, request.body ?? {});
    const status = await sendEmail(app.ctx, { to, locale, template: 'test', data: { sentBy: request.user!.email } });
    const last = await db.emailLog.findFirst({ where: { to: to.toLowerCase(), template: 'test' }, orderBy: { createdAt: 'desc' } });
    return { status, error: last?.error ?? null, configured: !!(await platformConfig(app.ctx)).email.host };
  });

  /** Check the Moyasar key saved in the portal (or the environment) against Moyasar's API. */
  app.post('/platform/config/payment/test', { preHandler: superOnly }, async () => {
    const { payment } = await platformConfig(app.ctx);
    if (!payment.moyasarSecretKey) return { configured: false, ok: false, status: 0, mode: 'unknown', message: 'No Moyasar secret key is set' };
    return { configured: true, ...(await moyasarCheckKey(fetch, payment.moyasarSecretKey)) };
  });

  /** Recent outgoing mail, newest first. */
  app.get('/platform/emails', { preHandler: superOnly }, async (request) => {
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(30) }), request.query ?? {});
    const rows = await db.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => ({ id: r.id, to: r.to, subject: r.subject, template: r.template, tenantId: r.tenantId, status: r.status, error: r.error, createdAt: r.createdAt.toISOString() }));
  });
}
