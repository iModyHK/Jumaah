/**
 * Library entry of the Jumaah API: what an extension (Jumaah Cloud) builds on. The Community server itself starts
 * from server.ts.
 */
export { buildApp, type BuildDeps, type BuildOptions } from './app.js';
export { loadConfig, config, type Config } from './config.js';
export { loadDotEnv, bootstrapGlobalProviders } from './server.js';
export type { AppContext, IO, RequestUser } from './lib/context.js';
export type { ApiExtension, CoreHooks, AiGate, EmailConfig, RenderedEmail, TenantRow, ViewerCounts, NetworkHit } from './lib/extensions.js';
export { mergeHooks } from './lib/extensions.js';
export { emitEvent } from './lib/events.js';
export { viewerCounts, viewerTotal } from './lib/viewers.js';
export { RESERVED_SLUGS, hostnameOf, isAllowedOrigin, tenantBaseUrl } from './lib/host.js';
export { HttpError, badRequest, conflict, forbidden, notFound, unauthorized } from './lib/errors.js';
export { idParam, parse } from './lib/validate.js';
export { audit, outbox, type Actor } from './lib/audit.js';
export { signAccessToken, verifyAccessToken, type AccessClaims } from './lib/jwt.js';
export { createRedis } from './lib/redis.js';
export * from './lib/serialize.js';
export { buildLiveKhutbah, buildTenantPublicInfo } from './lib/live-payload.js';
export { ADMIN_ROLES, ALL_STAFF, EDITOR_ROLES, forgetUserAuth } from './plugins/auth.js';
export { actorOf } from './routes/auth.js';
export { displayConfigOf } from './realtime/socket.js';
export { createTenantWithAdmin, slugProblem, type CreateTenantInput } from './services/tenant.service.js';
export { tenantFeatures, assertBrandingAllowed, assertSignageAllowed, effectiveBranding, effectiveSignage, featureDenied, localDateKey, type TenantFeaturesDto } from './services/features.service.js';
export { sendEmail, sendEmailLater, emailConfigured, envEmailConfig, type SendOptions } from './services/email.service.js';
export { renderTemplate, buildEmail, esc, dateLabel, FOOT, type Locale, type TemplateData, type TemplateName } from './services/email-templates.js';
export { getLiveKhutbah, getSnapshot, notifyKhutbahChanged, startSession, applyCommand } from './services/session.service.js';
export { exportTenant, restoreBackup } from './services/backup.service.js';
export { translateAdHoc, estimateCost, startJob } from './services/translation.service.js';
export { isOnline, loadGlossary, resolveChain } from './services/provider.service.js';
