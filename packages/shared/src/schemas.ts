import { z } from 'zod';
import { PRAYER_METHODS } from './prayer-times.js';
import { BILLING_CYCLES } from './billing.js';
import {
  ORG_MAX_TENANTS,
  WEBHOOK_EVENTS,
  DISPLAY_LAYOUTS,
  DISPLAY_THEMES,
  GLOSSARY_MODES,
  KHUTBAH_STATUSES,
  PARAGRAPH_KINDS,
  PROVIDER_TYPES,
  ROLES,
  SECTION_TYPES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  TRANSLATION_STATUSES,
  MAX_DISPLAY_LANGUAGES,
} from './constants.js';

export const langCode = z.string().min(2).max(8).regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/);
export const idSchema = z.string().min(1).max(64);

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  tenantSlug: z.string().min(1).max(64).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(200),
});

// ---------- Tenants ----------
const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');
/** Paid-edition branding, stored in tenant.settings.branding. Each field is gated by the plan on the server. */
export const brandingSchema = z
  .object({
    /** Small raster or SVG logo as a data URL (the admin resizes to 512px before upload). */
    logoDataUrl: z
      .string()
      .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image')
      .max(300_000, 'Logo must be under about 200 KB')
      .nullable()
      .optional(),
    primary: hexColour.nullable().optional(),
    accent: hexColour.nullable().optional(),
    css: z.string().max(20_000).nullable().optional(),
    hideMark: z.boolean().optional(),
  })
  .strict();
export type Branding = z.infer<typeof brandingSchema>;

/** One announcement shown on screens between khutbahs; either text may be empty but not both. */
export const announcementSchema = z
  .object({
    id: z.string().min(1).max(40),
    textAr: z.string().max(300).default(''),
    textEn: z.string().max(300).default(''),
    /** ISO dates (YYYY-MM-DD) bounding when it shows; open-ended when missing. */
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .refine((a) => a.textAr.trim() || a.textEn.trim(), { message: 'Announcement text is required' });
/** Screens between khutbahs (paid editions): date line and announcements, stored in tenant.settings.signage. */
export const signageSchema = z
  .object({
    showDate: z.boolean().optional(),
    announcements: z.array(announcementSchema).max(20).optional(),
  })
  .strict();
export type Signage = z.infer<typeof signageSchema>;
export type Announcement = z.infer<typeof announcementSchema>;

/** Mosque coordinates and calculation method; when set, the five daily prayer times are computed every day. */
export const prayerLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  method: z.enum(PRAYER_METHODS).default('UmmAlQura'),
  madhab: z.enum(['Shafi', 'Hanafi']).optional(),
  adjustments: z.object({ fajr: z.number().int().min(-60).max(60), dhuhr: z.number().int().min(-60).max(60), asr: z.number().int().min(-60).max(60), maghrib: z.number().int().min(-60).max(60), isha: z.number().int().min(-60).max(60) }).partial().optional(),
});

/** Public archive of delivered khutbahs (paid editions): the mosque switches it on; the plan must include it. */
export const archiveSchema = z.object({ enabled: z.boolean().optional() });
export type ArchiveSettings = z.infer<typeof archiveSchema>;

/** Shared translation network switches: read others' approved translations (default on), publish your own (opt-in). */
export const networkSchema = z.object({ read: z.boolean().optional(), publish: z.boolean().optional() });
export type NetworkSettings = z.infer<typeof networkSchema>;

export const tenantSettingsSchema = z.object({
  branding: brandingSchema.optional(),
  signage: signageSchema.optional(),
  archive: archiveSchema.optional(),
  network: networkSchema.optional(),
  prayerLocation: prayerLocationSchema.nullable().optional(),
  welcomeMessage: z.string().max(500).optional(),
  welcomeMessageEn: z.string().max(500).optional(),
  prayerTimes: z
    .object({ fajr: z.string(), dhuhr: z.string(), asr: z.string(), maghrib: z.string(), isha: z.string(), jumuah: z.string() })
    .partial()
    .optional(),
  logoUrl: z.string().max(1000).optional(),
  wordsPerMinute: z.number().int().min(40).max(300).optional(),
  defaultProviderChain: z.array(z.enum(PROVIDER_TYPES)).optional(),
  publicDisplayEnabled: z.boolean().optional(),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(1).max(64).default('Asia/Riyadh'),
  locale: z.enum(['ar', 'en']).default('ar'),
  /** New mosques start a 30-day Standard trial unless the super admin picks another plan. */
  plan: z.enum(SUBSCRIPTION_PLANS).default('STANDARD'),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(120),
  adminPassword: z.string().min(8).max(200).optional(),
  languages: z.array(langCode).default(['en', 'ur']),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  timezone: z.string().min(1).max(64).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  plan: z.enum(SUBSCRIPTION_PLANS).optional(),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  subscriptionEndsAt: z.string().datetime().nullable().optional(),
  settings: tenantSettingsSchema.optional(),
  librarySharingAllowed: z.boolean().optional(),
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
export const updateOrganisationSchema = createOrganisationSchema.partial();
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
export const applySponsorshipSchema = z.object({ tenantId: idSchema });

export const tenantLanguagesSchema = z.object({
  languages: z.array(z.object({ code: langCode, enabled: z.boolean().default(true) })).max(30),
});

// ---------- Users ----------
export const inviteUserSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(ROLES).exclude(['SUPER_ADMIN', 'DISPLAY']),
  name: z.string().max(120).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(120),
  role: z.enum(ROLES).exclude(['DISPLAY']),
  password: z.string().min(8).max(200),
  tenantId: idSchema.optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ROLES).exclude(['SUPER_ADMIN', 'DISPLAY']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

// ---------- Khutbahs ----------
export const paragraphInputSchema = z.object({
  text: z.string().min(1).max(5000),
  kind: z.enum(PARAGRAPH_KINDS).default('TEXT'),
  reference: z.string().max(200).optional().nullable(),
  estimatedSeconds: z.number().int().min(1).max(3600).optional(),
});

export const sectionInputSchema = z.object({
  type: z.enum(SECTION_TYPES),
  rawText: z.string().max(200000).optional(),
  paragraphs: z.array(paragraphInputSchema).optional(),
});

export const createKhutbahSchema = z.object({
  title: z.string().min(1).max(300),
  gregorianDate: z.string().date().or(z.string().datetime()),
  hijriDate: z.string().max(60).optional(),
  imamName: z.string().max(160).optional(),
  targetLanguages: z.array(langCode).min(0).max(30).optional(),
  sections: z.array(sectionInputSchema).max(3).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateKhutbahSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  gregorianDate: z.string().date().or(z.string().datetime()).optional(),
  hijriDate: z.string().max(60).nullable().optional(),
  imamName: z.string().max(160).nullable().optional(),
  targetLanguages: z.array(langCode).max(30).optional(),
  status: z.enum(KHUTBAH_STATUSES).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const replaceSectionTextSchema = z.object({
  rawText: z.string().max(200000),
  changeNote: z.string().max(500).optional(),
});

export const updateParagraphSchema = z.object({
  text: z.string().min(1).max(5000).optional(),
  kind: z.enum(PARAGRAPH_KINDS).optional(),
  reference: z.string().max(200).nullable().optional(),
  estimatedSeconds: z.number().int().min(1).max(3600).optional(),
});

export const splitParagraphSchema = z.object({
  /** Character offset in the paragraph text where the split happens. */
  offset: z.number().int().min(1),
});

export const mergeParagraphSchema = z.object({
  /** Paragraph id to merge INTO this one (must be the next paragraph in order). */
  withNextId: idSchema,
});

export const reorderParagraphsSchema = z.object({
  orderedIds: z.array(idSchema).min(1),
});

export const copyKhutbahSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  gregorianDate: z.string().date().or(z.string().datetime()).optional(),
  includeTranslations: z.boolean().default(true),
});

// ---------- Translations ----------
export const upsertTranslationSchema = z.object({
  lang: langCode,
  text: z.string().min(1).max(10000),
  status: z.enum(TRANSLATION_STATUSES).optional(),
});

export const bulkTranslateSchema = z.object({
  languages: z.array(langCode).min(1).max(30).optional(),
  paragraphIds: z.array(idSchema).optional(),
  providerChain: z.array(z.enum(PROVIDER_TYPES)).optional(),
  /** Overwrite translations that already exist in MACHINE/PENDING state. */
  force: z.boolean().default(false),
  /** Re-translate even Quran/Hadith blocks (normally skipped). */
  includeSpecialBlocks: z.boolean().default(false),
});

export const reviewTranslationSchema = z.object({
  action: z.enum(['approve', 'reject', 'reviewed']),
  text: z.string().min(1).max(10000).optional(),
  note: z.string().max(500).optional(),
});

export const importTranslationsSchema = z.object({
  lang: langCode,
  /** One entry per paragraph, in order. Empty strings are skipped. */
  texts: z.array(z.string().max(10000)),
  sectionType: z.enum(SECTION_TYPES).optional(),
  status: z.enum(['MACHINE', 'REVIEWED', 'APPROVED']).default('REVIEWED'),
});

// ---------- Glossary ----------
export const glossaryEntrySchema = z.object({
  term: z.string().min(1).max(200),
  lang: langCode.or(z.literal('*')).default('*'),
  replacement: z.string().max(400).optional().nullable(),
  mode: z.enum(GLOSSARY_MODES).default('KEEP'),
  note: z.string().max(400).optional().nullable(),
});

// ---------- Providers ----------
export const providerConfigSchema = z.object({
  type: z.enum(PROVIDER_TYPES),
  name: z.string().min(1).max(100),
  apiKey: z.string().max(2000).optional().nullable(),
  baseUrl: z.string().url().max(500).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
  priority: z.number().int().min(0).max(100).default(10),
  enabled: z.boolean().default(true),
  options: z.record(z.unknown()).optional(),
});

export const providerTestSchema = z.object({
  text: z.string().min(1).max(500).default('الحمد لله رب العالمين'),
  targetLang: langCode.default('en'),
});

// ---------- Displays ----------
export const displaySchema = z.object({
  name: z.string().min(1).max(120),
  languages: z.array(langCode).min(1).max(MAX_DISPLAY_LANGUAGES),
  layout: z.enum(DISPLAY_LAYOUTS).default('single'),
  fontScale: z.number().min(0.5).max(3).default(1),
  theme: z.enum(DISPLAY_THEMES).default('dark'),
  showPrevious: z.boolean().default(true),
  showArabic: z.boolean().default(false),
  showQr: z.boolean().default(true),
  logoUrl: z.string().max(1000).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
});

// ---------- Live session ----------
export const startSessionSchema = z.object({
  khutbahId: idSchema,
  /** Take over an existing active session from another device. */
  force: z.boolean().default(false),
  autoAdvance: z.boolean().default(false),
});

export const sessionCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('prev') }),
  z.object({ type: z.literal('goto'), paragraphId: idSchema }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('improv') }),
  z.object({ type: z.literal('section'), section: z.enum(SECTION_TYPES) }),
  z.object({ type: z.literal('autoAdvance'), enabled: z.boolean() }),
  z.object({ type: z.literal('end') }),
]);
export type SessionCommand = z.infer<typeof sessionCommandSchema>;

// ---------- Library ----------
export const shareToLibrarySchema = z.object({
  khutbahId: idSchema,
  description: z.string().max(1000).optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

// ---------- Sync ----------
export const syncPushSchema = z.object({
  tenantSlug: z.string(),
  deviceId: z.string().max(100),
  entries: z
    .array(
      z.object({
        id: z.string(),
        entity: z.string(),
        entityId: z.string(),
        op: z.enum(['UPSERT', 'DELETE']),
        payload: z.record(z.unknown()),
        version: z.number().int(),
        occurredAt: z.string().datetime(),
      }),
    )
    .max(500),
});

export const syncPullSchema = z.object({
  tenantSlug: z.string(),
  since: z.string().datetime().nullable().optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const remoteTranslateSchema = z.object({
  tenantSlug: z.string(),
  items: z
    .array(z.object({ id: z.string(), text: z.string().max(5000), kind: z.enum(PARAGRAPH_KINDS).default('TEXT') }))
    .min(1)
    .max(200),
  targetLangs: z.array(langCode).min(1).max(30),
  glossary: z.array(glossaryEntrySchema).max(500).default([]),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().max(200).optional(),
});
