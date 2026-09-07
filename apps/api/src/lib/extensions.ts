/**
 * Extension points of the Jumaah API. The core is a complete server for one or more mosques; an extension (such as
 * Jumaah Cloud) plugs in through these hooks and registers its own routes. Every hook is optional: without any
 * extension the server behaves as the Community Edition.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Features, HostInfoDto } from '@jumaah/core';
import type { HttpError } from './errors.js';
import type { AppContext, RequestUser } from './context.js';

/** A tenant row as the core selects it; extensions read their own columns from the same row. */
export interface TenantRow {
  id: string;
  slug: string;
  name?: string;
  timezone?: string;
  settings?: unknown;
  isActive?: boolean;
  [key: string]: unknown;
}

/** Gate on the server's own (platform) translation providers for one mosque. */
export interface AiGate {
  plan: string;
  state: string;
  allowed: boolean;
  maxLanguages: number | null;
  monthlyParagraphs: number | null;
  remainingParagraphs: number | null;
  /** Why this many languages / paragraphs may not use the platform providers, or null when they may. */
  denied(languages: number, paragraphs: number): string | null;
  /** The error to throw for a denial. */
  error(reason: string, extra?: Record<string, unknown>): HttpError;
  /** What clients get to see (CostEstimate.ext.ai). */
  dto: Record<string, unknown>;
}

export interface ViewerCounts {
  displays: number;
  phones: number;
  /** Device ids of the phones connected right now. */
  phoneDevices: string[];
}

export interface EmailConfig {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface NetworkHit {
  id: string;
  text: string;
  sourceTenantId: string;
}

export interface CoreHooks {
  /** Label for /health and the admin: 'community' unless an extension says otherwise. */
  mode?: string;
  /** Skip the internet probe before translating (a hosted server is always online). */
  assumeOnline?: boolean;
  /** Extra slugs no mosque may take (the platform's own host labels). */
  reservedSlugs?: Set<string>;
  /** Name the tenant behind the Host header (alnoor.jumaah.net → "alnoor", or a verified custom domain). */
  hostSlug?(request: FastifyRequest): Promise<string | null>;
  /** Extra browser origins allowed by CORS. */
  allowOrigin?(origin: string): Promise<boolean>;
  /** Authenticate a bearer token that is not a JWT (API keys). */
  authenticateToken?(request: FastifyRequest, token: string): Promise<{ user: RequestUser; tenantId: string } | null>;
  /** Extra data carried in access tokens and AuthUser.ext (the organisation a user administers). */
  tokenExt?(user: { id: string; tenantId: string | null }): Promise<Record<string, unknown> | null>;
  /** Whether a signed-in user may still use the API, with data cached next to it for a minute. */
  liveness?(ctx: AppContext, userId: string): Promise<{ ok: boolean; ext?: Record<string, unknown> } | null>;
  /** Let a non-super user act on another mosque (organisation admins): return the tenant id, null to keep the user's own, or throw to refuse. */
  switchTenant?(request: FastifyRequest, user: RequestUser, wanted: string): Promise<string | null>;
  /** Which mosque a socket may join when the token's mosque and the requested one differ. */
  socketTenant?(claims: { sub: string; tid: string | null }, wanted: string): Promise<string | null>;
  /** Whether a mosque's users may sign in (subscription checks). */
  tenantLoginAllowed?(tenant: TenantRow): boolean;
  /** Features of a mosque. Without a hook every mosque has the Community set. */
  features?(tenant: TenantRow): { features: Features; ext?: Record<string, unknown> };
  /** Validate settings keys the extension owns before they are saved (throw to refuse). */
  validateTenantSettings?(before: TenantRow, settings: Record<string, unknown>): void;
  /** Platform-AI gate for a translation run; null = no gate. */
  aiGate?(ctx: AppContext, tenantId: string): Promise<AiGate | null>;
  recordAiUsage?(ctx: AppContext, tenantId: string, usage: { khutbahId?: string | null; lang: string; source: string; providerType: string; paragraphs: number; characters: number }): Promise<void>;
  /** Shared translation network: a reviewed translation of the same Arabic from elsewhere, if the mosque may read it. */
  networkLookup?(ctx: AppContext, tenantId: string, hash: string, lang: string): Promise<NetworkHit | null>;
  networkSave?(ctx: AppContext, tenantId: string, paragraphId: string, lang: string, hit: NetworkHit, userId: string | null): Promise<void>;
  /** Domain events (webhooks, publishing to the network, …). Must never throw. */
  onEvent?(ctx: AppContext, tenantId: string, event: string, data: Record<string, unknown>): void;
  /** The number of connected screens and phones changed (attendance insight). */
  viewersChanged?(ctx: AppContext, tenantId: string, sessionId: string | null, counts: ViewerCounts): Promise<void>;
  /** Extra columns to store on the LiveSession row when a session ends (also sent with session.ended). */
  sessionEndStats?(ctx: AppContext, tenantId: string, sessionId: string): Promise<Record<string, unknown> | null>;
  /** Fields merged into TenantDto.ext. */
  tenantDtoExt?(tenant: TenantRow): Record<string, unknown>;
  /** Extra columns for a newly created mosque, and secrets to show once (a sync key). */
  tenantCreateData?(input: Record<string, unknown>): { data: Record<string, unknown>; secrets?: Record<string, string> };
  afterTenantCreate?(ctx: AppContext, tenant: TenantRow): Promise<void>;
  /** Base URL of one mosque's links (its own host or domain); null = PUBLIC_BASE_URL. */
  tenantBaseUrl?(ctx: AppContext, tenant: { id: string; slug: string }): Promise<string | null>;
  /** Fields merged into GET /public/host. */
  hostInfo?(request: FastifyRequest): Promise<Partial<HostInfoDto>>;
  /** Fields merged into the public tenant info screens receive (TenantPublicInfo.ext). */
  publicInfoExt?(tenant: TenantRow, features: Features): Record<string, unknown>;
  /** SMTP settings from somewhere other than the environment. */
  emailConfig?(ctx: AppContext): Promise<EmailConfig | null>;
  /** Additional email templates by name. */
  emailTemplates?: Record<string, (locale: 'ar' | 'en', data: Record<string, unknown>) => RenderedEmail>;
  /** Fields merged into GET /platform/stats. */
  platformStats?(ctx: AppContext): Promise<Record<string, unknown>>;
}

export interface ApiExtension {
  name: string;
  hooks?: CoreHooks;
  /** Register routes under /api. */
  register?(api: FastifyInstance): Promise<void>;
  onReady?(ctx: AppContext): Promise<void> | void;
}

export function mergeHooks(extensions: ApiExtension[]): CoreHooks {
  const out: CoreHooks = {};
  for (const e of extensions) Object.assign(out, e.hooks ?? {});
  return out;
}
