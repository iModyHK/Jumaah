import type { FastifyInstance } from 'fastify';
import { customDomainSchema, type DomainStatusDto } from '@jumaah/core';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { ADMIN_ROLES } from '../plugins/auth.js';
import { checkDns, cnameTarget, forgetCustomDomain, normalizeDomain } from '../services/domain.service.js';
import { tenantFeatures } from '../services/features.service.js';
import { actorOf } from './auth.js';

/** Custom domain of the current mosque (hosted edition, Pro): set, verify the DNS, clear. */
export async function domainRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;
  const admin = app.requireRole(...ADMIN_ROLES);

  const status = (t: { slug: string; plan: string; subscriptionStatus: string; subscriptionEndsAt: Date | null; customDomain: string | null; customDomainVerifiedAt: Date | null }, error: string | null = null): DomainStatusDto => {
    const { features } = tenantFeatures(t as never);
    const reason = !config.tenantBaseDomain ? 'NO_BASE_DOMAIN' : !features.customDomain ? 'NOT_IN_PLAN' : null;
    return {
      available: reason === null,
      reason,
      domain: t.customDomain,
      verified: !!t.customDomainVerifiedAt,
      verifiedAt: t.customDomainVerifiedAt?.toISOString() ?? null,
      target: cnameTarget(config, t.slug),
      error,
    };
  };

  const current = async (tenantId: string) => {
    const t = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw notFound('Tenant');
    return t;
  };

  app.get('/tenant/domain', { preHandler: admin }, async (request) => status(await current(request.tenantId)));

  /** Set (or clear with null) the domain. Setting needs the feature; clearing is always fine. Verification restarts. */
  app.put('/tenant/domain', { preHandler: admin }, async (request) => {
    const body = parse(customDomainSchema, request.body);
    const t = await current(request.tenantId);
    let domain: string | null = null;
    if (body.domain) {
      const st = status(t);
      if (!st.available) throw badRequest(st.reason === 'NO_BASE_DOMAIN' ? 'Custom domains need the hosted edition' : 'Custom domains are not included in this plan', { reason: st.reason });
      const n = normalizeDomain(body.domain, config);
      if (n.domain === null) throw badRequest(n.error === 'PLATFORM_DOMAIN' ? 'Choose a domain you own, not a Jumaah address' : 'Not a valid host name', { code: n.error });
      domain = n.domain;
      const taken = await db.tenant.findUnique({ where: { customDomain: n.domain }, select: { id: true } });
      if (taken && taken.id !== t.id) throw conflict('This domain is already used by another mosque');
    }
    if (domain === t.customDomain) return status(t);
    const updated = await db.tenant.update({ where: { id: t.id }, data: { customDomain: domain, customDomainVerifiedAt: null } });
    await Promise.all([forgetCustomDomain(app.ctx, t.customDomain), forgetCustomDomain(app.ctx, domain)]);
    await audit(db, t.id, actorOf(request), 'tenant.domain.set', 'Tenant', t.id, { customDomain: t.customDomain }, { customDomain: domain });
    return status(updated);
  });

  /** Look the domain up in DNS; on success the domain goes live (links, host resolution, certificate on demand). */
  app.post('/tenant/domain/verify', { preHandler: admin }, async (request) => {
    const t = await current(request.tenantId);
    if (!t.customDomain) throw badRequest('No domain set');
    const target = cnameTarget(config, t.slug);
    if (!target) throw badRequest('Custom domains need the hosted edition');
    const res = await checkDns(t.customDomain, target);
    const updated = await db.tenant.update({ where: { id: t.id }, data: { customDomainVerifiedAt: res.ok ? new Date() : null } });
    await forgetCustomDomain(app.ctx, t.customDomain);
    await audit(db, t.id, actorOf(request), res.ok ? 'tenant.domain.verified' : 'tenant.domain.verifyFailed', 'Tenant', t.id, null, { domain: t.customDomain, error: res.error });
    return status(updated, res.error);
  });
}
