/**
 * Payment gateway (hosted edition). Provider "manual" (default) means bank transfer: the invoice carries the IBAN
 * and the super admin marks it paid. Provider "moyasar" creates a hosted Moyasar invoice (mada, Apple Pay, cards)
 * and verifies payments by asking Moyasar's API, never by trusting a callback on its own. Settings come from the
 * portal (Platform → Payments) with PAYMENT_PROVIDER / MOYASAR_* in the environment as defaults.
 */
import type { CloudContext as AppContext } from '../context.js';
import { platformConfig, type PlatformConfig } from './platform-config.service.js';

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

/** Does the secret key work? Lists one payment; 200 means the key is valid, 401 means it is not. */
export async function moyasarCheckKey(fetchFn: FetchLike, secret: string): Promise<{ ok: boolean; status: number; mode: 'test' | 'live' | 'unknown'; message: string | null }> {
  const mode = secret.startsWith('sk_test_') ? 'test' : secret.startsWith('sk_live_') ? 'live' : 'unknown';
  try {
    const res = await fetchFn(`${MOYASAR_API}/payments?per=1`, { headers: { authorization: basic(secret) } });
    if (res.ok) return { ok: true, status: res.status, mode, message: null };
    return { ok: false, status: res.status, mode, message: (await res.text()).slice(0, 200) };
  } catch (err) {
    return { ok: false, status: 0, mode, message: (err as Error).message.slice(0, 200) };
  }
}

export function paymentProviderName(payment: Pick<PlatformConfig['payment'], 'provider' | 'moyasarSecretKey'>): 'manual' | 'moyasar' {
  return payment.provider === 'moyasar' && payment.moyasarSecretKey ? 'moyasar' : 'manual';
}

/** A pay link for an invoice, or null when payment is by bank transfer. */
export async function createPayment(
  ctx: AppContext,
  invoice: { id: string; number: string; total: number; accessToken: string },
  fetchFn: FetchLike = fetch,
): Promise<PaymentCreation | null> {
  const { config } = ctx;
  const { payment } = await platformConfig(ctx);
  if (paymentProviderName(payment) !== 'moyasar') return null;
  const base = config.PUBLIC_BASE_URL.replace(/\/$/, '');
  const view = `${base}/display/invoice/${encodeURIComponent(invoice.number)}?t=${invoice.accessToken}`;
  const created = await moyasarCreateInvoice(fetchFn, payment.moyasarSecretKey!, {
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
  const { payment } = await platformConfig(ctx);
  if (provider === 'moyasar' && payment.moyasarSecretKey) return moyasarInvoiceState(fetchFn, payment.moyasarSecretKey, ref);
  return 'pending';
}
