/**
 * Billing rules of Jumaah Cloud (the plan document, section 6): monthly or yearly subscriptions in SAR, yearly = ten
 * months, bulk tiers for large organisations, sponsor-a-mosque at the Standard yearly price, VAT added on top once
 * the company is registered. Money is handled in halalas (1 SAR = 100 halalas) as integers.
 */
import type { SubscriptionPlan } from './constants.js';

export const BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];
export const INVOICE_STATUSES = ['OPEN', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_KINDS = ['SUBSCRIPTION', 'SPONSORSHIP'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];
export const SPONSORSHIP_STATUSES = ['PENDING', 'PAID', 'APPLIED'] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

/** Monthly list price per plan, SAR. */
export const PLAN_PRICES_SAR: Record<SubscriptionPlan, number> = { FREE: 0, BASIC: 79, STANDARD: 199, PRO: 399, ENTERPRISE: 999 };
/** A year costs ten months (two months free). */
export const YEARLY_MONTHS = 10;
/** Sponsor a mosque: one year of Standard for one mosque. */
export const SPONSOR_PRICE_SAR = 1990;
/** Bulk tiers (Standard level, yearly invoice), largest first. */
export const BULK_TIERS = [
  { minMosques: 100, perMosqueMonthly: 119 },
  { minMosques: 25, perMosqueMonthly: 149 },
] as const;
/** Days before the paid-until date a renewal invoice is issued. */
export const RENEWAL_LEAD_DAYS = 14;
/** Days a subscription invoice may stay unpaid after its due date before the mosque is marked past due. */
export const OVERDUE_GRACE_DAYS = 7;
/** Days from issue to due date. */
export const INVOICE_DUE_DAYS = 7;
export const CURRENCY = 'SAR';

export function toHalalas(sar: number): number {
  return Math.round(sar * 100);
}

/** Price of a plan for one billing period, in halalas. */
export function priceFor(plan: SubscriptionPlan, cycle: BillingCycle): number {
  const monthly = PLAN_PRICES_SAR[plan] ?? 0;
  return toHalalas(cycle === 'YEARLY' ? monthly * YEARLY_MONTHS : monthly);
}

/** Bulk price per mosque per month for `n` mosques, or null below the first tier. */
export function bulkPerMosqueMonthly(n: number): number | null {
  for (const tier of BULK_TIERS) if (n >= tier.minMosques) return tier.perMosqueMonthly;
  return null;
}

/** VAT on top of a net amount; all halalas. */
export function computeTotals(subtotal: number, vatRate: number): { subtotal: number; vat: number; total: number } {
  const vat = Math.round(subtotal * vatRate);
  return { subtotal, vat, total: subtotal + vat };
}

/** The end of a period that starts at `from`: one calendar month or one year later. */
export function addCycle(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from.getTime());
  if (cycle === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export function addYears(from: Date, years: number): Date {
  const d = new Date(from.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/** "1,990.00" style formatting of halalas; the currency word is added by the caller in its language. */
export function formatSar(halalas: number, locale: 'ar' | 'en' = 'en'): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(halalas / 100);
}

/**
 * ZATCA phase-one QR content for a simplified tax invoice: TLV of seller name (1), VAT number (2), timestamp (3),
 * total with VAT (4) and VAT amount (5), base64 encoded. Works in browsers and Node (no Buffer).
 */
export function zatcaQr(input: { sellerName: string; vatNumber: string; timestamp: Date; totalHalalas: number; vatHalalas: number }): string {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const push = (tag: number, value: string) => {
    const bytes = enc.encode(value);
    parts.push(new Uint8Array([tag, bytes.length]), bytes);
  };
  push(1, input.sellerName);
  push(2, input.vatNumber);
  push(3, input.timestamp.toISOString());
  push(4, (input.totalHalalas / 100).toFixed(2));
  push(5, (input.vatHalalas / 100).toFixed(2));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  let bin = '';
  for (const b of out) bin += String.fromCharCode(b);
  return btoa(bin);
}
