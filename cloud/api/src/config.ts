/** Settings of Jumaah Cloud on top of the core configuration (.env of the hosted stack). */
import { z } from 'zod';
import type { Config } from '@jumaah/api';

const schema = z.object({
  /** Mosques live at <slug>.<TENANT_BASE_DOMAIN>. Empty = single address. */
  TENANT_BASE_DOMAIN: z.string().optional(),
  // ---- Billing ----
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
  /** Cloudflare Turnstile secret for the public forms (the marketing site posts to this API). */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /** The marketing site, linked from emails and the admin. */
  SITE_URL: z.string().optional(),
});

export type CloudEnv = z.infer<typeof schema>;
export type CloudConfig = Config &
  CloudEnv & {
    isCloud: true;
    DEPLOYMENT_MODE: 'cloud';
    tenantBaseDomain: string | null;
  };

export function loadCloudConfig(core: Config, env: NodeJS.ProcessEnv = process.env): CloudConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid cloud environment: ${issues}`);
  }
  const e = parsed.data;
  return { ...core, ...e, isCloud: true, DEPLOYMENT_MODE: 'cloud', tenantBaseDomain: e.TENANT_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, '') || null };
}

export type { CloudConfig as Config };
