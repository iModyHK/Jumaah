import { randomBytes } from 'node:crypto';
import { z } from 'zod';

function durationToSeconds(v: string): number {
  const m = /^(\d+)\s*(s|m|h|d)?$/.exec(v.trim());
  if (!m) throw new Error(`Invalid duration: ${v}`);
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[unit];
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEPLOYMENT_MODE: z.enum(['edge', 'cloud']).default('edge'),
  IMAGE_TAG: z.string().default('dev'),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),
  /** Hosted edition: mosques live at <slug>.<TENANT_BASE_DOMAIN>. Empty = single address (edge / self-hosted). */
  TENANT_BASE_DOMAIN: z.string().optional(),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  JWT_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  RATE_LIMIT_AUTH: z.coerce.number().int().default(10),
  RATE_LIMIT_GENERAL: z.coerce.number().int().default(300),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_TRANSLATE_API_KEY: z.string().optional(),
  DEEPL_API_KEY: z.string().optional(),
  LIBRETRANSLATE_URL: z.string().optional(),
  OLLAMA_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().optional(),
  CLOUD_API_URL: z.string().optional(),
  EDGE_TENANT_SLUG: z.string().optional(),
  EDGE_SYNC_KEY: z.string().optional(),
  EDGE_DEVICE_ID: z.string().optional(),
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().default(60),
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_KEEP: z.coerce.number().int().default(20),
  STATIC_DIR: z.string().optional(),
  // ---- Billing (hosted edition) ----
  /** 0 until the company is VAT-registered, then 0.15. */
  BILLING_VAT_RATE: z.coerce.number().min(0).max(1).default(0),
  BILLING_VAT_NUMBER: z.string().optional(),
  BILLING_SELLER_NAME: z.string().default('Jumaah Cloud'),
  BILLING_SELLER_ADDRESS: z.string().optional(),
  BILLING_IBAN: z.string().optional(),
  BILLING_BANK: z.string().optional(),
  BILLING_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(360),
  /** manual = bank transfer, the super admin marks invoices paid; moyasar = hosted card / mada / Apple Pay page. */
  PAYMENT_PROVIDER: z.enum(['manual', 'moyasar']).default('manual'),
  MOYASAR_SECRET_KEY: z.string().optional(),
  MOYASAR_WEBHOOK_SECRET: z.string().optional(),
  /** Cloudflare Turnstile secret for the public sponsor form (www.jumaah.net posts to this API). */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  // ---- Email (defaults; the portal's Platform → Email settings override them) ----
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM_NAME: z.string().default('Jumaah'),
  MAIL_FROM_EMAIL: z.string().optional(),
  MAIL_REPLY_TO: z.string().optional(),
  /** Where platform notices go (new sponsorships, failed deliveries). */
  MAIL_NOTIFY: z.string().optional(),
  /** The marketing site, linked from emails and the admin. */
  SITE_URL: z.string().optional(),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const e = parsed.data;
  return {
    ...e,
    isProd: e.NODE_ENV === 'production',
    isEdge: e.DEPLOYMENT_MODE === 'edge',
    isCloud: e.DEPLOYMENT_MODE === 'cloud',
    accessTokenTtlSeconds: durationToSeconds(e.ACCESS_TOKEN_TTL),
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cloudApiUrl: e.CLOUD_API_URL?.replace(/\/$/, '') || null,
    tenantBaseDomain: e.TENANT_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, '') || null,
    edgeDeviceId: e.EDGE_DEVICE_ID || `edge-${randomBytes(4).toString('hex')}`,
  };
}

let cached: Config | null = null;
export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}
