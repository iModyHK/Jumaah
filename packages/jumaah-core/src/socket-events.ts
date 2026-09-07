import type { ParagraphKind, SectionType, SessionState, TranslationStatus } from './constants.js';
import type { PrayerLocation } from './prayer-times.js';

/** A paragraph as delivered to displays: source + every approved translation. */
export interface LiveParagraph {
  id: string;
  sectionType: SectionType;
  order: number;
  kind: ParagraphKind;
  reference: string | null;
  textAr: string;
  estimatedSeconds: number;
  /** lang -> { text, status }. Displays only render APPROVED; others show "translation pending". */
  translations: Record<string, { text: string; status: TranslationStatus }>;
}

export interface LiveSectionSummary {
  type: SectionType;
  paragraphCount: number;
  firstParagraphId: string | null;
}

export interface LiveKhutbah {
  id: string;
  title: string;
  hijriDate: string | null;
  gregorianDate: string;
  imamName: string | null;
  targetLanguages: string[];
  sections: LiveSectionSummary[];
  paragraphs: LiveParagraph[];
  /** Increments on any text/translation change so displays can invalidate caches. */
  version: number;
}

export interface LiveSessionSnapshot {
  sessionId: string | null;
  tenantId: string;
  state: SessionState;
  khutbahId: string | null;
  currentParagraphId: string | null;
  currentIndex: number;
  currentSection: SectionType | null;
  autoAdvance: boolean;
  startedAt: string | null;
  sectionStartedAt: string | null;
  /** Monotonic sequence number; clients drop out-of-order updates. */
  seq: number;
  updatedAt: string;
  imamConnected: boolean;
}

/** Branding as screens and phones may show it: stored settings already filtered by the mosque's plan. */
export interface TenantPublicBranding {
  /** Uploaded logo (data URL) when the plan allows it, else the plain logo URL, else null. */
  logoUrl: string | null;
  /** Highlight colour (#RRGGBB) or null for the theme default. */
  primary: string | null;
  /** Background colour (#RRGGBB) or null for the theme default. */
  accent: string | null;
  /** Free-form CSS for screens and the phone page (Pro), or null. */
  css: string | null;
  /** Hide the small Jumaah mark (Pro). */
  hideMark: boolean;
}

/** What screens show between khutbahs (paid editions), already filtered by plan and by date. */
export interface TenantPublicSignage {
  /** Show the Hijri and Gregorian date under the clock. */
  showDate: boolean;
  /** Announcements active today, in display order. */
  announcements: Array<{ id: string; textAr: string; textEn: string }>;
}

export interface TenantPublicInfo {
  id: string;
  name: string;
  slug: string;
  locale: 'ar' | 'en';
  timezone: string;
  logoUrl: string | null;
  welcomeMessage: string | null;
  welcomeMessageEn: string | null;
  /** Manual times (and the Jumu'ah time, which is always manual). */
  prayerTimes: Record<string, string> | null;
  /** When set, screens compute the five daily times from it every day. */
  prayerLocation: PrayerLocation | null;
  languages: string[];
  branding: TenantPublicBranding;
  signage: TenantPublicSignage;
  /** The public archive page (/display/a/<slug>) is open: plan includes it and the mosque switched it on. */
  archiveEnabled: boolean;
}

export interface DisplayConfig {
  id: string;
  name: string;
  languages: string[];
  layout: 'single' | 'split' | 'grid';
  fontScale: number;
  theme: string;
  showPrevious: boolean;
  showArabic: boolean;
  showQr: boolean;
  logoUrl: string | null;
  publicUrl: string;
}

/** Events server -> client */
export interface ServerToClientEvents {
  'session:state': (snapshot: LiveSessionSnapshot) => void;
  'session:khutbah': (khutbah: LiveKhutbah) => void;
  'session:paragraphUpdated': (paragraph: LiveParagraph) => void;
  'display:config': (config: DisplayConfig) => void;
  'tenant:info': (info: TenantPublicInfo) => void;
  'imam:conflict': (info: { message: string; activeSince: string; deviceId: string }) => void;
  'imam:ack': (info: { seq: number; commandId: string }) => void;
  'server:time': (ts: number) => void;
  'error:message': (err: { code: string; message: string }) => void;
  'job:progress': (job: { id: string; khutbahId: string; status: string; total: number; done: number; failed: number; cached: number; error: string | null }) => void;
  'displays:count': (info: { count: number }) => void;
  'khutbah:changed': (info: { khutbahId: string; version: number }) => void;
}

/** Events client -> server */
export interface ClientToServerEvents {
  'display:hello': (payload: { token: string; deviceId: string }, ack?: (ok: boolean) => void) => void;
  'imam:hello': (payload: { deviceId: string }, ack?: (snapshot: LiveSessionSnapshot | null) => void) => void;
  'imam:command': (
    payload: { commandId: string; command: unknown; clientSeq: number },
    ack?: (res: { ok: boolean; seq?: number; error?: string }) => void,
  ) => void;
  'imam:heartbeat': (payload: { deviceId: string }) => void;
  'ping:time': (clientTs: number, ack: (serverTs: number) => void) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  tenantId: string;
  role: 'DISPLAY' | 'IMAM' | 'ADMIN' | 'PUBLIC';
  userId?: string;
  displayId?: string;
  deviceId?: string;
  /** True for imam, mosque admin and super admin tokens: the only roles allowed to send `imam:command`. */
  canCommand?: boolean;
}

/** Redis channel naming */
export const CHANNELS = {
  session: (tenantId: string) => `jumaah:session:${tenantId}`,
  khutbah: (tenantId: string) => `jumaah:khutbah:${tenantId}`,
  displays: (tenantId: string) => `jumaah:displays:${tenantId}`,
};

export const ROOMS = {
  tenant: (tenantId: string) => `t:${tenantId}`,
  displays: (tenantId: string) => `t:${tenantId}:displays`,
  imam: (tenantId: string) => `t:${tenantId}:imam`,
  admin: (tenantId: string) => `t:${tenantId}:admin`,
};
