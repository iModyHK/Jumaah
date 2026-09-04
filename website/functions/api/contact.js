/**
 * Cloudflare Pages Function: POST /api/contact
 * Thin wrapper around the shared logic in ../../shared/submit.mjs.
 * Secrets: TURNSTILE_SECRET_KEY, RESEND_API_KEY, optional TO_EMAIL / FROM_EMAIL. Bind KV as RATE_LIMIT to enable the per-IP limit.
 */
import { handleSubmission, MAX_PER_HOUR } from "../../shared/submit.mjs";
import { SECURITY_HEADERS } from "../../shared/headers.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...SECURITY_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function onRequest({ request }) {
  return json({ ok: false, error: request.method === "POST" ? "not_found" : "method" }, request.method === "POST" ? 404 : 405);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const rateLimit = env.RATE_LIMIT
    ? async (key) => {
        const count = Number(await env.RATE_LIMIT.get(key)) || 0;
        if (count >= MAX_PER_HOUR) return true;
        await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 3600 });
        return false;
      }
    : undefined;
  const { status, data } = await handleSubmission({
    body,
    origin: request.headers.get("Origin") || "",
    host: request.headers.get("Host") || "",
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: request.cf?.country || "",
    userAgent: request.headers.get("User-Agent") || "",
    env,
    rateLimit,
  });
  return json(data, status);
}
