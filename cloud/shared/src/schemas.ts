/** Request schemas of the hosted edition: organisations, API keys, webhooks, billing, platform settings, sign-up. */
import { z } from 'zod';
import { idSchema, langCode } from '@jumaah/core';
import { BILLING_CYCLES } from './billing.js';
import { ORG_MAX_TENANTS, SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES, WEBHOOK_EVENTS } from './constants.js';

/** Public archive of delivered khutbahs (paid editions): the mosque switches it on; the plan must include it. */
export const archiveSchema = z.object({ enabled: z.boolean().optional() });
export type ArchiveSettings = z.infer<typeof archiveSchema>;

/** Shared translation network switches: read others' approved translations (default on), publish your own (opt-in). */
export const networkSchema = z.object({ read: z.boolean().optional(), publish: z.boolean().optional() });
export type NetworkSettings = z.infer<typeof networkSchema>;

/** Plan and subscription fields the super admin may set on a mosque. */
export const cloudTenantUpdateSchema = z.object({
  plan: z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  subscriptionEndsAt: z.string().datetime().nullable().optional(),
});

/** A public host name: at least two labels of letters, digits and hyphens, ending in a TLD of letters. */
export const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Custom domain of a mosque (Pro, hosted edition); null clears it. */
export const customDomainSchema = z.object({
  domain: z.string().trim().toLowerCase().max(253).regex(HOSTNAME_RE, 'Not a valid host name').nullable(),
});

// ---------- Organisations (hosted edition) ----------
export const createOrganisationSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  maxTenants: z.number().int().min(1).max(100).default(ORG_MAX_TENANTS),
});
export const updateOrganisationSchema = createOrganisationSchema.partial().extend({
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  billingName: z.string().max(160).nullable().optional(),
  billingVatNumber: z.string().regex(/^\d{15}$/, 'A Saudi VAT number has 15 digits').nullable().optional(),
  billingAddress: z.string().max(300).nullable().optional(),
  billingEmail: z.string().email().max(200).nullable().optional(),
});
export const organisationTenantSchema = z.object({ tenantId: idSchema });
export const organisationAdminSchema = z.object({ email: z.string().email().max(200) });

// ---------- API keys and webhooks (hosted edition) ----------
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  readOnly: z.boolean().default(true),
});
export const createWebhookSchema = z.object({
  name: z.string().min(1).max(80),
  url: z.string().url().max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(10),
  enabled: z.boolean().default(true),
});
export const updateWebhookSchema = createWebhookSchema.partial();

// ---------- Billing (hosted edition) ----------
export const billingSettingsSchema = z.object({
  cycle: z.enum(BILLING_CYCLES),
  billingName: z.string().max(160).optional(),
  billingVatNumber: z.string().regex(/^\d{15}$/, 'A Saudi VAT number has 15 digits').optional(),
  billingAddress: z.string().max(300).optional(),
  billingEmail: z.string().email().max(200).optional(),
});
export const sponsorSchema = z.object({
  sponsorName: z.string().min(2).max(160),
  sponsorEmail: z.string().email().max(200),
  sponsorPhone: z.string().max(40).optional(),
  mosques: z.number().int().min(1).max(100).default(1),
  mosqueName: z.string().max(160).optional(),
  message: z.string().max(1000).optional(),
  lang: z.enum(['ar', 'en']).default('ar'),
  turnstileToken: z.string().max(4096).optional(),
});
export const markPaidSchema = z.object({ reference: z.string().max(200).optional() });

// ---------- Platform configuration in the portal (hosted edition) ----------
export const PLATFORM_CONFIG_GROUPS = ['billing', 'payment', 'email', 'security'] as const;
export type PlatformConfigGroup = (typeof PLATFORM_CONFIG_GROUPS)[number];
/** A secret field: a string sets it, null clears it, undefined / '' keeps what is stored. */
const secretField = z.string().max(500).nullable().optional();
export const platformGroupSchemas = {
  billing: z.object({
    sellerName: z.string().min(1).max(160).nullable().optional(),
    sellerAddress: z.string().max(300).nullable().optional(),
    vatRate: z.number().min(0).max(1).nullable().optional(),
    vatNumber: z.string().regex(/^\d{15}$/, 'A Saudi VAT number has 15 digits').nullable().optional(),
    bank: z.string().max(120).nullable().optional(),
    iban: z.string().max(40).nullable().optional(),
  }),
  payment: z.object({
    provider: z.enum(['manual', 'moyasar']).optional(),
    moyasarSecretKey: secretField,
    moyasarWebhookSecret: secretField,
  }),
  email: z.object({
    host: z.string().max(200).nullable().optional(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    secure: z.boolean().optional(),
    user: z.string().max(200).nullable().optional(),
    pass: secretField,
    fromName: z.string().max(120).nullable().optional(),
    fromEmail: z.string().email().max(200).nullable().optional(),
    replyTo: z.string().email().max(200).nullable().optional(),
    notifyEmail: z.string().email().max(200).nullable().optional(),
  }),
  security: z.object({
    turnstileSecret: secretField,
    siteUrl: z.string().url().max(200).nullable().optional(),
  }),
} as const;
export const testEmailSchema = z.object({ to: z.string().email().max(200), locale: z.enum(['ar', 'en']).default('ar') });

/** Plans a mosque can start or buy by itself (Organisation accounts are set up with us). */
export const SELF_SERVICE_PLANS = ['BASIC', 'STANDARD', 'PRO'] as const;
export const signupSchema = z.object({
  mosqueName: z.string().min(2).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().email().max(200),
  password: z.string().min(8).max(200),
  plan: z.enum(SELF_SERVICE_PLANS).default('STANDARD'),
  cycle: z.enum(BILLING_CYCLES).default('MONTHLY'),
  locale: z.enum(['ar', 'en']).default('ar'),
  languages: z.array(langCode).min(1).max(30).default(['en', 'ur']),
  timezone: z.string().max(64).default('Asia/Riyadh'),
  turnstileToken: z.string().max(4096).optional(),
});
export const subscribeSchema = z.object({ plan: z.enum(SELF_SERVICE_PLANS), cycle: z.enum(BILLING_CYCLES) });
/** Super admin: an invoice with its own wording and amount (bulk contracts, adjustments); a period + plan extends the subscription when paid. */
export const customInvoiceSchema = z
  .object({
    tenantId: idSchema.optional(),
    organisationId: idSchema.optional(),
    description: z.string().min(2).max(300),
    descriptionAr: z.string().max(300).optional(),
    quantity: z.number().int().min(1).max(10000).default(1),
    /** Unit price in SAR. */
    unitPriceSar: z.number().min(0).max(10_000_000),
    dueDays: z.number().int().min(0).max(365).default(14),
    plan: z.enum(SUBSCRIPTION_PLANS).optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => !!v.tenantId !== !!v.organisationId, { message: 'Exactly one of tenantId or organisationId' })
  .refine((v) => !v.periodEnd || !!v.periodStart, { message: 'periodStart is required with periodEnd' });
export const applySponsorshipSchema = z.object({ tenantId: idSchema });
