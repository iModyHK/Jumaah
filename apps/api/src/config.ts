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
  /** Shown in the portal and /api/health: the image tag from compose, else the version baked into the image. */
  IMAGE_TAG: z.string().default(process.env.APP_VERSION || 'dev'),
  API_PORT: z.coerce.number().int().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:8080'),
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
  // ---- Email (optional; an extension may supply settings from elsewhere) ----
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
  /** Where server notices go. */
  MAIL_NOTIFY: z.string().optional(),
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
    accessTokenTtlSeconds: durationToSeconds(e.ACCESS_TOKEN_TTL),
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cloudApiUrl: e.CLOUD_API_URL?.replace(/\/$/, '') || null,
    edgeDeviceId: e.EDGE_DEVICE_ID || `edge-${randomBytes(4).toString('hex')}`,
  };
}

let cached: Config | null = null;
export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}
