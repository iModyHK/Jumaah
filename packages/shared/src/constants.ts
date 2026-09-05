export const ROLES = ['SUPER_ADMIN', 'MOSQUE_ADMIN', 'TRANSLATOR', 'IMAM', 'DISPLAY'] as const;
export type Role = (typeof ROLES)[number];

export const SECTION_TYPES = ['FIRST', 'SECOND', 'DUA'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const PARAGRAPH_KINDS = ['TEXT', 'QURAN', 'HADITH'] as const;
export type ParagraphKind = (typeof PARAGRAPH_KINDS)[number];

export const TRANSLATION_STATUSES = ['PENDING', 'MACHINE', 'REVIEWED', 'APPROVED', 'REJECTED'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export const KHUTBAH_STATUSES = ['DRAFT', 'TRANSLATING', 'REVIEW', 'READY', 'DELIVERED', 'ARCHIVED'] as const;
export type KhutbahStatus = (typeof KHUTBAH_STATUSES)[number];

export const SESSION_STATES = ['WAITING', 'LIVE', 'PAUSED', 'IMPROV', 'ENDED'] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const PROVIDER_TYPES = [
  'MANUAL',
  'ANTHROPIC',
  'OPENAI',
  'GOOGLE',
  'DEEPL',
  'LIBRETRANSLATE',
  'OLLAMA',
  /** Edge-only: relay the request to the central cloud server, which runs its own chain. */
  'CLOUD',
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const GLOSSARY_MODES = ['KEEP', 'REPLACE', 'HINT'] as const;
export type GlossaryMode = (typeof GLOSSARY_MODES)[number];

export const DISPLAY_LAYOUTS = ['single', 'split', 'grid'] as const;
export type DisplayLayout = (typeof DISPLAY_LAYOUTS)[number];

export const DISPLAY_THEMES = ['dark', 'light', 'green', 'gold'] as const;
export type DisplayTheme = (typeof DISPLAY_THEMES)[number];

export const SUBSCRIPTION_PLANS = ['FREE', 'BASIC', 'STANDARD', 'PRO', 'ENTERPRISE'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

/**
 * What each hosted plan includes. Only the platform's own AI providers are gated by this; a mosque's own keys and
 * the self-hosted (community) edition are never limited. Allowances are counted in paragraph translations
 * (one paragraph into one language); PARAGRAPHS_PER_KHUTBAH_UNIT turns them into "khutbah translations" for people.
 */
export interface PlanLimits {
  /** Platform AI translation included. */
  ai: boolean;
  /** Distinct AI target languages allowed per job; null = unlimited. */
  maxLanguages: number | null;
  /** Paragraph translations per calendar month on platform AI; null = unlimited. */
  monthlyParagraphs: number | null;
}
export const PARAGRAPHS_PER_KHUTBAH_UNIT = 15;
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: { ai: false, maxLanguages: 0, monthlyParagraphs: 0 },
  BASIC: { ai: false, maxLanguages: 0, monthlyParagraphs: 0 },
  STANDARD: { ai: true, maxLanguages: 4, monthlyParagraphs: 60 * PARAGRAPHS_PER_KHUTBAH_UNIT },
  PRO: { ai: true, maxLanguages: null, monthlyParagraphs: 150 * PARAGRAPHS_PER_KHUTBAH_UNIT },
  ENTERPRISE: { ai: true, maxLanguages: null, monthlyParagraphs: 1500 * PARAGRAPHS_PER_KHUTBAH_UNIT },
};
/**
 * Paid-edition features by plan (the feature matrix of the plan document). The core — preparation, review, imam
 * control, screens, phones, offline, backups — is never listed here because it is always available.
 */
export interface PlanFeatures {
  /** Upload a logo file (stored with the mosque) instead of hosting an image URL yourself. */
  logoUpload: boolean;
  /** Primary and accent colours on screens and the phone page. */
  colours: boolean;
  /** Free-form CSS applied to screens and the phone page. */
  css: boolean;
  /** Remove the small Jumaah mark from screens and the phone page. */
  hideMark: boolean;
  /** Printable QR poster with the mosque's branding. */
  poster: boolean;
  /** Prayer times, dates and announcements on screens between khutbahs. */
  signage: boolean;
  /** Public archive page of past khutbahs. */
  archive: boolean;
  /** Printable handouts per language. */
  handouts: boolean;
  /** Aggregated attendance insight. */
  insight: boolean;
  /** Shared translation network: read others' reviewed translations / publish your own. */
  networkRead: boolean;
  networkPublish: boolean;
  /** API access and webhooks. */
  api: boolean;
  /** The mosque's own address (khutbah.alnoor.org.sa) instead of <slug>.jumaah.net. */
  customDomain: boolean;
}
const NO_FEATURES: PlanFeatures = { logoUpload: false, colours: false, css: false, hideMark: false, poster: false, signage: false, archive: false, handouts: false, insight: false, networkRead: false, networkPublish: false, api: false, customDomain: false };
export const PLAN_FEATURES: Record<SubscriptionPlan, PlanFeatures> = {
  FREE: NO_FEATURES,
  BASIC: { ...NO_FEATURES, logoUpload: true, poster: true },
  STANDARD: { ...NO_FEATURES, logoUpload: true, colours: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true },
  PRO: { logoUpload: true, colours: true, css: true, hideMark: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true, networkPublish: true, api: true, customDomain: true },
  ENTERPRISE: { logoUpload: true, colours: true, css: true, hideMark: true, poster: true, signage: true, archive: true, handouts: true, insight: true, networkRead: true, networkPublish: true, api: true, customDomain: true },
};
/** Organisation account (ENTERPRISE plan): mosques one organisation may manage by default. */
export const ORG_MAX_TENANTS = 10;
/** Days after subscriptionEndsAt during which platform AI keeps working, so a late payment never blanks a Friday. */
export const AI_GRACE_DAYS = 7;
/** Length of the trial a new hosted mosque starts with. */
export const TRIAL_DAYS = 30;

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'TRIAL', 'PAST_DUE', 'SUSPENDED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const DEPLOYMENT_MODES = ['edge', 'cloud'] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

/** Average Arabic reading speed for a khatib: ~110 words per minute. */
export const WORDS_PER_MINUTE_AR = 110;
export const MIN_PARAGRAPH_SECONDS = 8;
export const SOURCE_LANG = 'ar';
export const SESSION_HEARTBEAT_MS = 5000;
export const SESSION_STALE_MS = 30000;
/** Outbox rows rejected by the other side this many times are parked until an admin requeues them. */
export const OUTBOX_MAX_ATTEMPTS = 10;
export const MAX_DISPLAY_LANGUAGES = 4;
