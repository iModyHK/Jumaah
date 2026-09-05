/**
 * Payment gateway (hosted edition). `PAYMENT_PROVIDER=manual` (default) means bank transfer: the invoice carries the
 * IBAN and the super admin marks it paid. `PAYMENT_PROVIDER=moyasar` creates a hosted Moyasar invoice (mada, Apple Pay,
 * cards) and verifies payments by asking Moyasar's API, never by trusting a callback on its own.
 */
import type { Config } from '../config.js';
import type { AppContext } from '../lib/context.js';

export interface PaymentCreation {
  provider: string;
  ref: string;
  url: string;
}

export type PaymentState = 'paid' | 'pending' | 'failed';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const MOYASAR_API = 'https://api.moyasar.com/v1';

function basic(secret: string): string {
  return `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;
}

/** Create a hosted Moyasar invoice; the customer pays on `url`, Moyasar then calls `callbackUrl`. */
export async function moyasarCreateInvoice(
  fetchFn: FetchLike,
  secret: string,
  input: { amountHalalas: number; description: string; callbackUrl: string; successUrl: string; backUrl: string; jumaahInvoiceId: string },
): Promise<{ id: string; url: string }> {
  const res = await fetchFn(`${MOYASAR_API}/invoices`, {
    method: 'POST',
    headers: { authorization: basic(secret), 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: input.amountHalalas,
      currency: 'SAR',
      description: input.description,
      callback_url: input.callbackUrl,
      success_url: input.successUrl,
      back_url: input.backUrl,
      metadata: { jumaah_invoice: input.jumaahInvoiceId },
    }),
  });
  if (!res.ok) throw new Error(`Moyasar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { id: string; url: string };
  return { id: body.id, url: body.url };
}

export async function moyasarInvoiceState(fetchFn: FetchLike, secret: string, id: string): Promise<PaymentState> {
  const res = await fetchFn(`${MOYASAR_API}/invoices/${encodeURIComponent(id)}`, { headers: { authorization: basic(secret) } });
  if (!res.ok) throw new Error(`Moyasar ${res.status}`);
  const body = (await res.json()) as { status: string };
  if (body.status === 'paid') return 'paid';
  if (body.status === 'initiated') return 'pending';
  return 'failed';
}

export function paymentProviderName(config: Pick<Config, 'PAYMENT_PROVIDER' | 'MOYASAR_SECRET_KEY'>): 'manual' | 'moyasar' {
  return config.PAYMENT_PROVIDER === 'moyasar' && config.MOYASAR_SECRET_KEY ? 'moyasar' : 'manual';
}

/** A pay link for an invoice, or null when payment is by bank transfer. */
export async function createPayment(
  ctx: AppContext,
  invoice: { id: string; number: string; total: number; accessToken: string },
  fetchFn: FetchLike = fetch,
): Promise<PaymentCreation | null> {
  const { config } = ctx;
  if (paymentProviderName(config) !== 'moyasar') return null;
  const base = config.PUBLIC_BASE_URL.replace(/\/$/, '');
  const view = `${base}/display/invoice/${encodeURIComponent(invoice.number)}?t=${invoice.accessToken}`;
  const created = await moyasarCreateInvoice(fetchFn, config.MOYASAR_SECRET_KEY!, {
    amountHalalas: invoice.total,
    description: `Jumaah Cloud ${invoice.number}`,
    callbackUrl: `${base}/api/public/billing/moyasar/callback?invoice=${invoice.id}`,
    successUrl: `${view}&paid=1`,
    backUrl: view,
    jumaahInvoiceId: invoice.id,
  });
  return { provider: 'moyasar', ref: created.id, url: created.url };
}

export async function verifyPayment(ctx: AppContext, provider: string, ref: string, fetchFn: FetchLike = fetch): Promise<PaymentState> {
  if (provider === 'moyasar' && ctx.config.MOYASAR_SECRET_KEY) return moyasarInvoiceState(fetchFn, ctx.config.MOYASAR_SECRET_KEY, ref);
  return 'pending';
}
