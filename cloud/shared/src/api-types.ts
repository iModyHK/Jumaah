/** Response types of the hosted edition. */
import type { ProviderType, Role, LiveKhutbah, TenantPublicInfo } from '@jumaah/core';
import type { SubscriptionPlan, SubscriptionStatus, WebhookEvent } from './constants.js';
import type { BillingCycle, InvoiceKind, InvoiceStatus, SponsorshipStatus } from './billing.js';

/** What the hosted edition adds to TenantDto.ext. */
export interface CloudTenantExt {
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  organisationId: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
}

/** What the hosted edition adds to AuthUser.ext. */
export interface CloudAuthExt {
  organisationId: string | null;
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
  /** The mosque asked to stop at the paid-until date (no renewal invoice; plan falls back to FREE). */
  cancelAtPeriodEnd: boolean;
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

/** GET /public/signup/slug — can this address be used for a new mosque? */
export interface SlugCheckDto {
  slug: string;
  available: boolean;
  reason: 'invalid' | 'reserved' | 'taken' | null;
  /** The full host the mosque would get, e.g. alnoor.jumaah.net (null on servers without hostname tenancy). */
  address: string | null;
}

/** POST /public/signup — the mosque was created and its trial started. */
export interface SignupResultDto {
  slug: string;
  name: string;
  plan: SubscriptionPlan;
  trialEndsAt: string | null;
  adminUrl: string;
  phoneUrl: string;
}

/** GET /platform/config — values by group; secrets replaced by { set, hint }. */
export interface PlatformConfigDto {
  groups: Record<'billing' | 'payment' | 'email' | 'security', Record<string, unknown>>;
  /** "group.field" entries that come from the portal rather than the environment. */
  fromPortal: string[];
  secretFields: Record<'billing' | 'payment' | 'email' | 'security', string[]>;
}

export interface EmailLogDto {
  id: string;
  to: string;
  subject: string;
  template: string;
  tenantId: string | null;
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  error: string | null;
  createdAt: string;
}
