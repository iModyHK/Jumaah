/**
 * Contact form logic shared by the Cloudflare Pages Function and the Node server.
 * Fields: mosque (name or mosque), contact (email or WhatsApp number), question.
 *
 * Bot protection, in order:
 *   1. Same-origin check (the form must be posted from this site)
 *   2. Honeypot field ("website") — bots that fill it get a fake success and nothing is sent
 *   3. Minimum fill time (4 s from page load to submit)
 *   4. Cloudflare Turnstile token verified server-side with the secret key
 *   5. Optional per-IP rate limit (caller supplies the store)
 */

export const DEFAULT_TO = "malkurbi5@gmail.com";
export const DEFAULT_FROM = "Jumaah <onboarding@resend.dev>";
export const MIN_FILL_MS = 4000;
export const MAX_PER_HOUR = 5;

const str = (v, max) => String(Array.isArray(v) ? v.join(", ") : v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isPhone = (v) => /^\+?[\d\s().-]{7,20}$/.test(v);

export async function handleSubmission({ body, origin, host, ip, country, userAgent, env, rateLimit }) {
  if (!body || typeof body !== "object") return { status: 400, data: { ok: false, error: "bad_json" } };

  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    if (originHost !== host) return { status: 403, data: { ok: false, error: "origin" } };
  }

  if (str(body.website, 10)) return { status: 200, data: { ok: true } };

  const started = Number(body.started);
  if (!started || Date.now() - started < MIN_FILL_MS) return { status: 400, data: { ok: false, error: "too_fast" } };

  const token = str(body["cf-turnstile-response"], 4096);
  if (!token) return { status: 400, data: { ok: false, error: "captcha" } };
  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || undefined }),
  }).then((r) => r.json()).catch(() => ({ success: false }));
  if (!verify.success) return { status: 400, data: { ok: false, error: "captcha" } };

  if (rateLimit && ip && (await rateLimit(`rl:contact:${ip}`))) return { status: 429, data: { ok: false, error: "rate" } };

  const mosque = str(body.mosque, 160);
  const contact = str(body.contact, 200);
  const question = String(body.question ?? "").trim().slice(0, 3000);
  if (!mosque || !contact || !question) return { status: 400, data: { ok: false, error: "required" } };
  if (!isEmail(contact) && !isPhone(contact)) return { status: 400, data: { ok: false, error: "contact" } };

  const subject = `[Jumaah] Question from ${mosque}`;
  const bodyText =
    [["From", mosque], ["Contact", contact]].map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nQuestion:\n${question}\n\n---\n` +
    [
      `Form language: ${str(body.lang, 5) || "-"}`,
      `IP: ${ip || "-"}`,
      `IP country: ${country || "-"}`,
      `User agent: ${userAgent || "-"}`,
      `Received: ${new Date().toISOString()}`,
    ].join("\n");

  const mail = { from: env.FROM_EMAIL || DEFAULT_FROM, to: [env.TO_EMAIL || DEFAULT_TO], subject, text: bodyText };
  if (isEmail(contact)) mail.reply_to = contact;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(mail),
  }).catch(() => null);

  if (!r || !r.ok) {
    const detail = r ? await r.text().catch(() => "") : "network";
    console.error("Resend failed:", r ? r.status : "-", detail.slice(0, 300));
    return { status: 502, data: { ok: false, error: "mail" } };
  }
  return { status: 200, data: { ok: true } };
}
