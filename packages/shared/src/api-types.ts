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
  WebhookEvent,
} from './constants.js';
import type { LiveKhutbah, TenantPublicInfo } from './socket-events.js';
import type { BillingCycle, InvoiceKind, InvoiceStatus, SponsorshipStatus } from './billing.js';

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
  /** Organisation admins manage every mosque of this organisation (hosted edition). */
  organisationId: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** GET /public/host — the mosque implied by the address the browser used (hosted edition), else nulls. */
export interface HostInfoDto {
  tenantBaseDomain: string | null;
  slug: string | null;
  tenant: { id: string; name: string; slug: string; locale: 'ar' | 'en' } | null;
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
  organisationId: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
  _count?: { users: number; khutbahs: number; displays: number };
}

/** Custom domain of the current mosque (hosted edition, Pro). */
export interface DomainStatusDto {
  /** False on servers without hostname tenancy or on plans without the feature (`reason` says which). */
  available: boolean;
  reason: 'NO_BASE_DOMAIN' | 'NOT_IN_PLAN' | null;
  domain: string | null;
  verified: boolean;
  verifiedAt: string | null;
  /** What the mosque's DNS record must point at (CNAME), e.g. alnoor.jumaah.net. */
  target: string | null;
  /** Last verification error, if any. */
  error: string | null;
}

export interface OrganisationTenantDto {
  id: string;
  name: string;
  slug: string;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  customDomain: string | null;
  isActive: boolean;
}

export interface OrganisationDto {
  id: string;
  name: string;
  slug: string;
  maxTenants: number;
  createdAt: string;
  tenants: OrganisationTenantDto[];
  admins: Array<{ id: string; email: string; name: string; tenantId: string | null }>;
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
  /** Hosted edition: whether the platform's AI may be used for this job (absent on self-hosted servers). */
  ai?: AiAllowanceDto;
}

export type AiDenyReason = 'NOT_INCLUDED' | 'EXPIRED' | 'SUSPENDED' | 'QUOTA' | 'LANGUAGES';

/** GET /tenant/ai-usage — the mosque's platform-AI allowance for the current month. */
export interface AiAllowanceDto {
  /** false on self-hosted servers: nothing is gated there. */
  applies: boolean;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  /** active = paid or trial; grace = ended within the grace window; expired/suspended = AI off. */
  state: 'active' | 'grace' | 'expired' | 'suspended';
  aiIncluded: boolean;
  maxLanguages: number | null;
  monthlyParagraphs: number | null;
  usedParagraphs: number;
  remainingParagraphs: number | null;
  /** YYYY-MM (UTC) the counters refer to. */
  month: string;
  endsAt: string | null;
  graceEndsAt: string | null;
  allowed: boolean;
  reason: AiDenyReason | null;
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
  /** Outbox rows parked after OUTBOX_MAX_ATTEMPTS rejected pushes; retried only via POST /sync/retry-failed. */
  failedOutbox: number;
  lastError: string | null;
  imageTag: string;
  latestImageTag: string | null;
}

// ---------------------------------------------------------------------------
// Paid-edition extras: public archive, printable handouts, attendance insight
// ---------------------------------------------------------------------------

/** One past khutbah on the public archive page. */
export interface ArchiveItemDto {
  id: string;
  title: string;
  hijriDate: string | null;
  gregorianDate: string;
  imamName: string | null;
  languages: string[];
}

export interface ArchiveListDto {
  tenant: TenantPublicInfo;
  items: ArchiveItemDto[];
}

export interface ArchiveKhutbahDto {
  tenant: TenantPublicInfo;
  khutbah: LiveKhutbah;
}

/** What the admin's printable handout page needs: the khutbah with approved translations, plus the mosque header. */
export interface HandoutDto {
  tenant: { name: string; locale: 'ar' | 'en'; logoUrl: string | null };
  khutbah: LiveKhutbah;
}

export interface InsightSessionDto {
  id: string;
  khutbahId: string;
  title: string;
  gregorianDate: string;
  hijriDate: string | null;
  imamName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  peakDisplays: number;
  peakPhones: number;
  uniquePhones: number;
}

export interface InsightDto {
  sessions: InsightSessionDto[];
  summary: { sessions: number; avgPhones: number; maxPhones: number; avgDisplays: number; avgDurationSec: number };
}

// ---------------------------------------------------------------------------
// Shared translation network, API keys, webhooks (hosted edition)
// ---------------------------------------------------------------------------

export interface NetworkStatusDto {
  plan: SubscriptionPlan;
  /** What the plan permits. */
  allowed: { read: boolean; publish: boolean };
  /** The mosque's switches as stored. */
  read: boolean;
  publish: boolean;
  /** Switches limited by the plan: what actually happens. */
  effective: { read: boolean; publish: boolean };
  /** Translations this mosque has published. */
  published: number;
  /** Translations this mosque picked up from the network. */
  reused: number;
  /** Size of the whole network. */
  pool: number;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  /** First characters of the key, for recognising it; the key itself is shown once at creation. */
  prefix: string;
  readOnly: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WebhookDto {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
  failures: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Billing (hosted edition): invoices, sponsorships
// ---------------------------------------------------------------------------

export interface InvoiceLine {
  description: string;
  descriptionAr: string;
  quantity: number;
  /** halalas */
  unitPrice: number;
  /** halalas */
  amount: number;
}

export interface InvoiceDto {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  tenantId: string | null;
  organisationId: string | null;
  sponsorshipId: string | null;
  plan: SubscriptionPlan | null;
  cycle: BillingCycle | null;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  subtotal: number;
  vatRate: number;
  vat: number;
  total: number;
  lines: InvoiceLine[];
  billTo: { name: string; vatNumber: string | null; address: string | null; email: string | null };
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  paymentProvider: string | null;
  /** Hosted payment page, when a gateway is configured and the invoice is open. */
  paymentUrl: string | null;
  /** Public, printable invoice page (number + secret token). */
  viewUrl: string;
  note: string | null;
  customerName: string | null;
  customerSlug: string | null;
}

export interface SellerInfoDto {
  name: string;
  vatNumber: string | null;
  address: string | null;
  iban: string | null;
  bank: string | null;
  vatRate: number;
  currency: string;
  provider: 'manual' | 'moyasar';
}

export interface BillingSettingsDto {
  cycle: BillingCycle;
  billingName: string | null;
  billingVatNumber: string | null;
  billingAddress: string | null;
  billingEmail: string | null;
}

export interface BillingOverviewDto {
  /** false on self-hosted servers: nothing is billed there. */
  applies: boolean;
  seller: SellerInfoDto;
  /** Monthly list prices in SAR. */
  prices: Record<SubscriptionPlan, number>;
  subscription: { plan: SubscriptionPlan; status: SubscriptionStatus; endsAt: string | null };
  organisation: { id: string; name: string } | null;
  settings: BillingSettingsDto;
  invoices: InvoiceDto[];
}

export interface SponsorshipDto {
  id: string;
  sponsorName: string;
  sponsorEmail: string;
  sponsorPhone: string | null;
  mosqueName: string | null;
  message: string | null;
  mosques: number;
  status: SponsorshipStatus;
  applied: Array<{ tenantId: string; tenantName: string; at: string }>;
  lang: 'ar' | 'en';
  createdAt: string;
  invoice: InvoiceDto | null;
}

export interface PlatformBillingDto {
  applies: boolean;
  seller: SellerInfoDto;
  open: InvoiceDto[];
  recentPaid: InvoiceDto[];
  sponsorships: SponsorshipDto[];
  totals: { openHalalas: number; paidThisMonthHalalas: number; month: string };
}

export interface SponsorResultDto {
  invoiceNumber: string;
  total: number;
  vat: number;
  currency: string;
  viewUrl: string;
  paymentUrl: string | null;
  seller: SellerInfoDto;
}

export interface PublicInvoiceDto {
  invoice: InvoiceDto;
  seller: SellerInfoDto;
  /** ZATCA phase-one QR payload (base64 TLV) once the seller has a VAT number. */
  qr: string | null;
}
