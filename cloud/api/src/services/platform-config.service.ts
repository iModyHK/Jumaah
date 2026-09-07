/**
 * Platform configuration editable in the portal (hosted edition): billing and VAT, payment gateway, email (SMTP),
 * security. Values live in PlatformSetting rows (one per group); secrets are encrypted with ENCRYPTION_KEY and never
 * returned in clear. Environment variables remain the defaults, so a fresh server works from .env alone and the
 * portal overrides field by field. Bootstrap and infrastructure settings (database, Redis, JWT, ports, base domain)
 * deliberately stay in the environment.
 */
import { apiKeyHint, decryptSecret, encryptSecret } from '@jumaah/cloud-db';
import type { Prisma } from '@jumaah/cloud-db';
import type { PlatformConfigDto, PlatformConfigGroup } from '@jumaah/cloud-shared';
import type { CloudConfig as Config } from '../config.js';
import type { CloudContext as AppContext } from '../context.js';

export interface PlatformConfig {
  billing: { sellerName: string; sellerAddress: string | null; vatRate: number; vatNumber: string | null; bank: string | null; iban: string | null };
  payment: { provider: 'manual' | 'moyasar'; moyasarSecretKey: string | null; moyasarWebhookSecret: string | null };
  email: { host: string | null; port: number; secure: boolean; user: string | null; pass: string | null; fromName: string; fromEmail: string | null; replyTo: string | null; notifyEmail: string | null };
  security: { turnstileSecret: string | null; siteUrl: string | null };
}

/** Which fields hold secrets (encrypted at rest, masked in the portal). */
export const SECRET_FIELDS: Record<PlatformConfigGroup, string[]> = {
  billing: [],
  payment: ['moyasarSecretKey', 'moyasarWebhookSecret'],
  email: ['pass'],
  security: ['turnstileSecret'],
};

const KEY = (group: PlatformConfigGroup) => `platform.${group}`;
const CACHE_MS = 30_000;
let cache: { at: number; value: PlatformConfig } | null = null;

/** Defaults from the environment. */
export function envPlatformConfig(config: Config): PlatformConfig {
  return {
    billing: { sellerName: config.BILLING_SELLER_NAME, sellerAddress: config.BILLING_SELLER_ADDRESS || null, vatRate: config.BILLING_VAT_RATE, vatNumber: config.BILLING_VAT_NUMBER || null, bank: config.BILLING_BANK || null, iban: config.BILLING_IBAN || null },
    payment: { provider: config.PAYMENT_PROVIDER, moyasarSecretKey: config.MOYASAR_SECRET_KEY || null, moyasarWebhookSecret: config.MOYASAR_WEBHOOK_SECRET || null },
    email: { host: config.SMTP_HOST || null, port: config.SMTP_PORT, secure: config.SMTP_SECURE, user: config.SMTP_USER || null, pass: config.SMTP_PASS || null, fromName: config.MAIL_FROM_NAME, fromEmail: config.MAIL_FROM_EMAIL || null, replyTo: config.MAIL_REPLY_TO || null, notifyEmail: config.MAIL_NOTIFY || null },
    security: { turnstileSecret: config.TURNSTILE_SECRET_KEY || null, siteUrl: config.SITE_URL || null },
  };
}

type Stored = Record<string, unknown>;

function decryptStored(raw: Stored, group: PlatformConfigGroup, key: string): Stored {
  const out: Stored = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SECRET_FIELDS[group].includes(k)) {
      const enc = (v as { $enc?: string } | null)?.$enc;
      out[k] = enc ? decryptSecret(enc, key) : null;
    } else out[k] = v;
  }
  return out;
}

/** Effective configuration: portal values over environment defaults. Cached for 30 s per process. */
export async function platformConfig(ctx: AppContext): Promise<PlatformConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const base = envPlatformConfig(ctx.config);
  const rows = await ctx.db.platformSetting.findMany({ where: { key: { in: (Object.keys(base) as PlatformConfigGroup[]).map(KEY) } } });
  const merged: PlatformConfig = JSON.parse(JSON.stringify(base));
  for (const row of rows) {
    const group = row.key.slice('platform.'.length) as PlatformConfigGroup;
    if (!(group in merged)) continue;
    const stored = decryptStored((row.value as Stored) ?? {}, group, ctx.config.ENCRYPTION_KEY);
    const target = merged[group] as unknown as Stored;
    for (const [k, v] of Object.entries(stored)) {
      if (!(k in target)) continue;
      // An empty / null portal value means "use the environment default".
      if (v === null || v === undefined || v === '') continue;
      target[k] = v;
    }
  }
  cache = { at: Date.now(), value: merged };
  return merged;
}

export function forgetPlatformConfig(): void {
  cache = null;
}

/**
 * Save one group from the portal. Secret fields: a string sets the secret, `null` clears it, and an absent or empty
 * value keeps what is stored. Non-secret fields are written as given (null = back to the environment default).
 */
export async function savePlatformGroup(ctx: AppContext, group: PlatformConfigGroup, input: Stored): Promise<void> {
  const existing = ((await ctx.db.platformSetting.findUnique({ where: { key: KEY(group) } }))?.value as Stored | undefined) ?? {};
  const next: Stored = { ...existing };
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_FIELDS[group].includes(k)) {
      if (v === null) next[k] = null;
      else if (typeof v === 'string' && v.trim()) next[k] = { $enc: encryptSecret(v.trim(), ctx.config.ENCRYPTION_KEY) };
      // '' or undefined: keep
    } else next[k] = v === undefined ? existing[k] : v;
  }
  await ctx.db.platformSetting.upsert({ where: { key: KEY(group) }, update: { value: next as Prisma.InputJsonValue }, create: { key: KEY(group), value: next as Prisma.InputJsonValue } });
  forgetPlatformConfig();
}

/** What the portal shows: every value, secrets replaced by "set" + a hint, and whether a field comes from the portal. */
export async function platformConfigDto(ctx: AppContext): Promise<PlatformConfigDto> {
  const effective = await platformConfig(ctx);
  const rows = await ctx.db.platformSetting.findMany({ where: { key: { in: (Object.keys(effective) as PlatformConfigGroup[]).map(KEY) } } });
  const fromPortal = new Set<string>();
  for (const row of rows) {
    const group = row.key.slice('platform.'.length);
    for (const [k, v] of Object.entries((row.value as Stored) ?? {})) if (v !== null && v !== undefined && v !== '') fromPortal.add(`${group}.${k}`);
  }
  const groups: PlatformConfigDto['groups'] = {} as PlatformConfigDto['groups'];
  for (const group of Object.keys(effective) as PlatformConfigGroup[]) {
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(effective[group] as unknown as Stored)) {
      values[k] = SECRET_FIELDS[group].includes(k) ? { set: !!v, hint: v ? apiKeyHint(String(v)) : null } : v;
    }
    (groups as Record<string, unknown>)[group] = values;
  }
  return { groups, fromPortal: [...fromPortal], secretFields: SECRET_FIELDS };
}
