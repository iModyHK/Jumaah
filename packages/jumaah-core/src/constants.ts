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

/**
 * Feature switches of a mosque. The core — preparation, review, imam control, screens, phones, offline, backups —
 * is never listed here because it is always available. Community Edition has a fixed set (COMMUNITY_FEATURES);
 * the hosted edition derives the set from the mosque's plan.
 */
export interface Features {
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
  /** The mosque's own address instead of one under the platform's domain. */
  customDomain: boolean;
}
export const NO_FEATURES: Features = { logoUpload: false, colours: false, css: false, hideMark: false, poster: false, signage: false, archive: false, handouts: false, insight: false, networkRead: false, networkPublish: false, api: false, customDomain: false };
/** What every mosque on a Community server has: its logo on screens and the poster, and the screens between khutbahs. */
export const COMMUNITY_FEATURES: Features = { ...NO_FEATURES, logoUpload: true, poster: true, signage: true };

/** Average Arabic reading speed for a khatib: ~110 words per minute. */
export const WORDS_PER_MINUTE_AR = 110;
export const MIN_PARAGRAPH_SECONDS = 8;
export const SOURCE_LANG = 'ar';
export const SESSION_HEARTBEAT_MS = 5000;
export const SESSION_STALE_MS = 30000;
/** Outbox rows rejected by the other side this many times are parked until an admin requeues them. */
export const OUTBOX_MAX_ATTEMPTS = 10;
export const MAX_DISPLAY_LANGUAGES = 4;
