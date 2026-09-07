/** Jumaah Cloud's implementation of the core hooks. */
import type { FastifyRequest } from 'fastify';
import type { AiGate, AppContext, CoreHooks, RequestUser, TenantRow, ViewerCounts } from '@jumaah/api';
import { HttpError } from '@jumaah/api';
import { cloudCtx } from './context.js';
import type { CloudConfig } from './config.js';
import { RESERVED_HOST_LABELS, customDomainCandidate, isAllowedOrigin, tenantBaseUrlFor, tenantSlugFromHost } from './lib/host.js';
import { API_KEY_FORBIDDEN, looksLikeApiKey, resolveApiKey, touchApiKey } from './services/api-key.service.js';
import { tenantByCustomDomain } from './services/domain.service.js';
import { cloudEmailTemplates } from './services/email-templates.js';
import { archiveEnabled, assertArchiveAllowed, assertNetworkAllowed, featuresOf } from './services/features.js';
import { readSessionStats, recordViewerPeaks } from './services/insight.service.js';
import { lookupNetwork, networkAccessOf, publishLater, saveNetworkTranslation } from './services/network.service.js';
import { tenantInOrganisation } from './services/organisation.service.js';
import { aiDenied, getAiAllowance, platformAiDenied, recordAiUsage, type SubscriptionLike } from './services/plan.service.js';
import { platformConfig } from './services/platform-config.service.js';
import { emitWebhook } from './services/webhook.service.js';
import { TRIAL_DAYS } from '@jumaah/cloud-shared';
import { sha256, randomToken } from '@jumaah/cloud-db';

export function cloudHooks(config: CloudConfig): CoreHooks {
  return {
    mode: 'cloud',
    assumeOnline: true,
    reservedSlugs: RESERVED_HOST_LABELS,

    async hostSlug(request: FastifyRequest) {
      const slug = tenantSlugFromHost(request.headers.host, config.tenantBaseDomain);
      if (slug) return slug;
      // A Pro mosque's own domain names the mosque just like <slug>.<base domain> does.
      const candidate = customDomainCandidate(request.headers.host, config);
      if (!candidate) return null;
      const ctx = cloudCtx((request.server as unknown as { ctx: AppContext }).ctx);
      return (await tenantByCustomDomain(ctx, candidate))?.slug ?? null;
    },

    async allowOrigin(origin: string) {
      if (isAllowedOrigin(origin, config)) return true;
      let host: string | null = null;
      try {
        host = customDomainCandidate(new URL(origin).host, config);
      } catch {
        host = null;
      }
      if (!host) return false;
      const ctx = current();
      return !!ctx && !!(await tenantByCustomDomain(ctx, host));
    },

    async authenticateToken(request, token) {
      if (!looksLikeApiKey(token)) return null;
      const ctx = cloudCtx((request.server as unknown as { ctx: AppContext }).ctx);
      const key = await resolveApiKey(ctx, token);
      if (!key) throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or revoked API key');
      // At a mosque address (or its custom domain) the key must belong to that mosque.
      if (request.hostSlug && request.hostSlug !== key.slug) throw new HttpError(401, 'UNAUTHORIZED', 'This API key belongs to another mosque');
      if (key.readOnly && request.method !== 'GET' && request.method !== 'HEAD') throw new HttpError(403, 'FORBIDDEN', 'This API key is read-only');
      if (API_KEY_FORBIDDEN.test(request.url)) throw new HttpError(403, 'FORBIDDEN', 'Not available to API keys');
      touchApiKey(ctx, key.id);
      const user: RequestUser = { id: `key:${key.id}`, email: `apikey:${key.name}`, role: 'MOSQUE_ADMIN', tenantId: key.tenantId, virtual: true, ext: { apiKey: { id: key.id, readOnly: key.readOnly } } };
      return { user, tenantId: key.tenantId };
    },

    async tokenExt(user) {
      const ctx = current();
      if (!ctx) return null;
      const row = await ctx.db.user.findUnique({ where: { id: user.id }, select: { organisationId: true } });
      return { organisationId: row?.organisationId ?? null };
    },

    async liveness(core, userId) {
      const ctx = cloudCtx(core);
      const dbUser = await ctx.db.user.findUnique({ where: { id: userId }, select: { isActive: true, organisationId: true, tenant: { select: { isActive: true, subscriptionStatus: true } } } });
      const ok = !!dbUser?.isActive && (dbUser.tenant ? dbUser.tenant.isActive && dbUser.tenant.subscriptionStatus !== 'SUSPENDED' : true);
      return { ok, ext: { organisationId: ok ? (dbUser?.organisationId ?? null) : null } };
    },

    async switchTenant(request, user, wanted) {
      const oid = (user.ext?.organisationId as string | null | undefined) ?? null;
      if (!oid) return null;
      const ctx = cloudCtx((request.server as unknown as { ctx: AppContext }).ctx);
      if (!(await tenantInOrganisation(ctx, wanted, oid))) throw new HttpError(403, 'FORBIDDEN', 'Mosque is not in your organisation');
      return wanted;
    },

    async socketTenant(claims, wanted) {
      const ctx = current();
      if (!ctx) return null;
      const [me, target] = await Promise.all([
        ctx.db.user.findUnique({ where: { id: claims.sub }, select: { organisationId: true } }),
        ctx.db.tenant.findUnique({ where: { id: wanted }, select: { organisationId: true } }),
      ]);
      return me?.organisationId && target?.organisationId === me.organisationId ? wanted : null;
    },

    tenantLoginAllowed(tenant) {
      return (tenant as { subscriptionStatus?: string }).subscriptionStatus !== 'SUSPENDED';
    },

    features: featuresOf,

    validateTenantSettings(before, settings) {
      const t = before as unknown as SubscriptionLike;
      assertArchiveAllowed(settings.archive as never, t);
      assertNetworkAllowed(settings.network as never, t);
    },

    async aiGate(core, tenantId): Promise<AiGate> {
      const ctx = cloudCtx(core);
      const a = await getAiAllowance(ctx, tenantId);
      return {
        plan: a.plan,
        state: a.state,
        allowed: a.allowed,
        maxLanguages: a.maxLanguages,
        monthlyParagraphs: a.monthlyParagraphs,
        remainingParagraphs: a.remainingParagraphs,
        denied: (languages, paragraphs) => platformAiDenied(a, languages, paragraphs),
        error: (reason, extra) => aiDenied(reason as never, { plan: a.plan, state: a.state, maxLanguages: a.maxLanguages, remaining: a.remainingParagraphs, ...(extra ?? {}) }),
        dto: a as unknown as Record<string, unknown>,
      };
    },

    async recordAiUsage(core, tenantId, usage) {
      await recordAiUsage(cloudCtx(core).db, tenantId, { khutbahId: usage.khutbahId ?? undefined, lang: usage.lang, source: usage.source as 'JOB' | 'RELAY', providerType: usage.providerType as never, paragraphs: usage.paragraphs, characters: usage.characters });
    },

    async networkLookup(core, tenantId, hash, lang) {
      const ctx = cloudCtx(core);
      const access = await networkAccessOf(ctx.db, tenantId);
      return access.read ? lookupNetwork(ctx.db, hash, lang) : null;
    },
    async networkSave(core, tenantId, paragraphId, lang, hit, userId) {
      await saveNetworkTranslation(cloudCtx(core), tenantId, paragraphId, lang, hit, userId);
    },

    onEvent(core, tenantId, event, data) {
      const ctx = cloudCtx(core);
      if (event === 'translations.approved' && Array.isArray(data.translationIds) && data.translationIds.length) publishLater(ctx, tenantId, data.translationIds as string[]);
      const { translationIds: _ids, ...payload } = data;
      emitWebhook(ctx, tenantId, event as never, payload);
    },

    async viewersChanged(core, tenantId, sessionId, counts: ViewerCounts) {
      if (sessionId) await recordViewerPeaks(cloudCtx(core), tenantId, sessionId, counts);
    },
    async sessionEndStats(core, tenantId, sessionId) {
      return readSessionStats(cloudCtx(core), tenantId, sessionId);
    },

    tenantDtoExt(t) {
      const x = t as unknown as { plan: string; subscriptionStatus: string; subscriptionEndsAt: Date | null; organisationId: string | null; customDomain: string | null; customDomainVerifiedAt: Date | null };
      return { plan: x.plan, subscriptionStatus: x.subscriptionStatus, subscriptionEndsAt: x.subscriptionEndsAt?.toISOString() ?? null, organisationId: x.organisationId ?? null, customDomain: x.customDomain ?? null, customDomainVerifiedAt: x.customDomainVerifiedAt?.toISOString() ?? null };
    },
    tenantCreateData(input) {
      // Every new hosted mosque gets a 30-day trial of the chosen plan; billing takes over afterwards.
      const syncKey = randomToken(24);
      return {
        data: { plan: (input.plan as string) ?? 'STANDARD', subscriptionStatus: 'TRIAL', subscriptionEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000), billingCycle: (input.cycle as string) ?? 'MONTHLY', syncKeyHash: sha256(syncKey) },
        secrets: { syncKey },
      };
    },
    async afterTenantCreate(core, tenant) {
      await cloudCtx(core).db.syncState.create({ data: { tenantId: tenant.id, deviceId: 'cloud' } });
    },
    async tenantBaseUrl(core, tenant) {
      const ctx = cloudCtx(core);
      const t = await ctx.db.tenant.findUnique({ where: { id: tenant.id }, select: { slug: true, customDomain: true, customDomainVerifiedAt: true } });
      return tenantBaseUrlFor(config, t ?? tenant);
    },
    async hostInfo() {
      return { tenantBaseDomain: config.tenantBaseDomain };
    },
    publicInfoExt(t) {
      return { archiveEnabled: archiveEnabled(((t.settings as Record<string, unknown>) ?? {}), t as unknown as SubscriptionLike) };
    },
    async emailConfig(core) {
      const { email } = await platformConfig(cloudCtx(core));
      return { host: email.host ?? null, port: email.port, secure: email.secure, user: email.user ?? null, pass: email.pass ?? null, fromName: email.fromName ?? null, fromEmail: email.fromEmail ?? null, replyTo: email.replyTo ?? null };
    },
    emailTemplates: cloudEmailTemplates,
    async platformStats(core) {
      const ctx = cloudCtx(core);
      const latest = await ctx.db.platformSetting.findUnique({ where: { key: 'edge.latestImageTag' } });
      return { latestImageTag: (latest?.value as { tag?: string })?.tag ?? config.IMAGE_TAG };
    },
  };
}

// Hooks without a request or a context argument reach the running app's context through this registration.
let currentCtx: AppContext | null = null;
export function registerContext(ctx: AppContext): void {
  currentCtx = ctx;
}
function current() {
  return currentCtx ? cloudCtx(currentCtx) : null;
}
