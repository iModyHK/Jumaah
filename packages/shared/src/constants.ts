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

export const SUBSCRIPTION_PLANS = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

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
