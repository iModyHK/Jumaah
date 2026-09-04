import type {
  KhutbahStatus,
  ParagraphKind,
  ProviderType,
  Role,
  SectionType,
  SubscriptionPlan,
  SubscriptionStatus,
  TranslationStatus,
  GlossaryMode,
} from './constants.js';

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  locale: 'ar' | 'en';
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: 'ar' | 'en';
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  librarySharingAllowed: boolean;
  settings: Record<string, unknown>;
  languages: string[];
  createdAt: string;
  _count?: { users: number; khutbahs: number; displays: number };
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface TranslationDto {
  id: string;
  paragraphId: string;
  lang: string;
  text: string;
  status: TranslationStatus;
  providerType: ProviderType | null;
  version: number;
  reviewedById: string | null;
  approvedById: string | null;
  updatedAt: string;
}

export interface ParagraphDto {
  id: string;
  sectionId: string;
  order: number;
  kind: ParagraphKind;
  reference: string | null;
  textAr: string;
  hash: string;
  estimatedSeconds: number;
  translations: TranslationDto[];
}

export interface SectionDto {
  id: string;
  type: SectionType;
  order: number;
  paragraphs: ParagraphDto[];
}

export interface KhutbahDto {
  id: string;
  tenantId: string;
  title: string;
  hijriDate: string | null;
  gregorianDate: string;
  imamName: string | null;
  status: KhutbahStatus;
  targetLanguages: string[];
  version: number;
  notes: string | null;
  copiedFromId: string | null;
  libraryId: string | null;
  createdAt: string;
  updatedAt: string;
  sections?: SectionDto[];
  stats?: KhutbahStats;
}

export interface KhutbahStats {
  paragraphs: number;
  perLanguage: Record<string, { approved: number; reviewed: number; machine: number; pending: number; rejected: number }>;
  estimatedSeconds: number;
}

export interface GlossaryDto {
  id: string;
  term: string;
  lang: string;
  replacement: string | null;
  mode: GlossaryMode;
  note: string | null;
}

export interface ProviderConfigDto {
  id: string;
  tenantId: string | null;
  type: ProviderType;
  name: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  baseUrl: string | null;
  model: string | null;
  priority: number;
  enabled: boolean;
  options: Record<string, unknown>;
  isGlobal: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
}

export interface DisplayDto {
  id: string;
  name: string;
  token: string;
  languages: string[];
  layout: 'single' | 'split' | 'grid';
  fontScale: number;
  theme: string;
  showPrevious: boolean;
  showArabic: boolean;
  showQr: boolean;
  logoUrl: string | null;
  location: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CostEstimate {
  characters: number;
  paragraphs: number;
  languages: number;
  cachedUnits: number;
  perProvider: Array<{ type: ProviderType; estimatedUsd: number; model?: string; note?: string }>;
}

export interface TranslationJobDto {
  id: string;
  khutbahId: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  total: number;
  done: number;
  failed: number;
  cached: number;
  languages: string[];
  providerChain: ProviderType[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export interface LibraryKhutbahDto {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  sourceTenantName: string;
  languages: string[];
  paragraphCount: number;
  approved: boolean;
  createdAt: string;
}

export interface BackupDto {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  note: string | null;
}

export interface SyncStatusDto {
  mode: 'edge' | 'cloud';
  cloudUrl: string | null;
  online: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  pendingOutbox: number;
  lastError: string | null;
  imageTag: string;
  latestImageTag: string | null;
}
