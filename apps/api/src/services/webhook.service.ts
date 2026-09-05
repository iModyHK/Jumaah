/**
 * Webhooks (hosted edition, Pro / Organisation). A mosque registers HTTPS endpoints for events such as a khutbah
 * being created or a live session starting; each delivery is a JSON POST signed with HMAC-SHA256 over the raw body
 * (header X-Jumaah-Signature: sha256=<hex>). Deliveries are fire-and-forget with one retry; the last result is kept
 * on the webhook row so the admin can see what happened.
 */
import { createHmac, randomUUID } from 'node:crypto';
import type { Webhook } from '@jumaah/db';
import type { WebhookEvent } from '@jumaah/shared';
import type { AppContext } from '../lib/context.js';
import { tenantFeatures } from './features.service.js';

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

export const DELIVERY_TIMEOUT_MS = 8000;

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|169\.254(\.\d{1,3}){2}|0(\.\d{1,3}){3}|\[?::1\]?|\[?fe80:.*|\[?fc00:.*|\[?fd[0-9a-f]{2}:.*)$/i;

/**
 * Is this an address we are willing to call? HTTPS to a public host name. Plain HTTP is tolerated outside
 * production (local testing), but loopback, link-local and private ranges are never called from the platform.
 */
export function webhookUrlError(url: string, production: boolean): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'INVALID_URL';
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && !production)) return 'HTTPS_REQUIRED';
  if (!u.hostname || PRIVATE_HOST.test(u.hostname)) return 'PRIVATE_HOST';
  if (u.username || u.password) return 'CREDENTIALS_IN_URL';
  return null;
}

export function buildPayload(tenantId: string, event: WebhookEvent, data: unknown): { id: string; body: string } {
  const id = randomUUID();
  const body = JSON.stringify({ id, event, createdAt: new Date().toISOString(), tenantId, data });
  return { id, body };
}

async function post(url: string, headers: Record<string, string>, body: string): Promise<DeliveryResult> {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal, redirect: 'manual' });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, error: res.status >= 200 && res.status < 300 ? null : `HTTP ${res.status}`, durationMs: Date.now() - started };
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    return { ok: false, status: null, error: e.name === 'AbortError' ? 'TIMEOUT' : (e.cause?.code ?? e.message).slice(0, 200), durationMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Deliver one payload to one webhook (one retry on failure), record the outcome, return it. */
export async function deliver(ctx: AppContext, hook: Pick<Webhook, 'id' | 'url' | 'secret'>, event: WebhookEvent, deliveryId: string, body: string): Promise<DeliveryResult> {
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'Jumaah-Webhooks/1.0',
    'x-jumaah-event': event,
    'x-jumaah-delivery': deliveryId,
    'x-jumaah-signature': signPayload(hook.secret, body),
  };
  let result = await post(hook.url, headers, body);
  if (!result.ok && (result.status === null || result.status >= 500)) {
    await new Promise((r) => setTimeout(r, 2000));
    result = await post(hook.url, headers, body);
  }
  await ctx.db.webhook
    .update({
      where: { id: hook.id },
      data: { lastStatus: result.status, lastError: result.error, lastDeliveredAt: new Date(), failures: result.ok ? 0 : { increment: 1 } },
    })
    .catch(() => undefined);
  if (!result.ok) ctx.log.warn({ webhookId: hook.id, event, ...result }, 'webhook delivery failed');
  return result;
}

/**
 * Emit an event for a mosque: every enabled webhook subscribed to it (or to "*") gets a delivery in the background.
 * Nothing happens unless the mosque's plan includes the API feature.
 */
export function emitWebhook(ctx: AppContext, tenantId: string, event: WebhookEvent, data: unknown): void {
  void (async () => {
    const t = await ctx.db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, subscriptionStatus: true, subscriptionEndsAt: true, isActive: true, webhooks: { where: { enabled: true } } } });
    if (!t || !t.isActive || !tenantFeatures(t).features.api) return;
    const hooks = t.webhooks.filter((h) => h.events.includes(event) || h.events.includes('*'));
    if (!hooks.length) return;
    const { id, body } = buildPayload(tenantId, event, data);
    await Promise.all(hooks.map((h) => deliver(ctx, h, event, id, body)));
  })().catch((err) => ctx.log.warn({ err, tenantId, event }, 'webhook emit failed'));
}
