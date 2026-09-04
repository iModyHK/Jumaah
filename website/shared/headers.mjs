/**
 * Security headers, shared by the Node server (all responses) and the Cloudflare Pages `_headers` file (written by build.mjs).
 *
 * CSP notes:
 * - script-src: our own site.js, GSAP from cdnjs, Turnstile from challenges.cloudflare.com. No inline scripts execute:
 *   page data ships as a JSON block (type="application/json") and structured data as ld+json, neither of which runs.
 * - style-src needs 'unsafe-inline' for the inlined stylesheet and a few style attributes in the markup. Low risk on its own.
 * - frame-src: the Turnstile widget iframe. connect-src 'self': only our /api/contact. Turnstile's own requests go from its iframe.
 * - img-src: our assets plus data: for the inline SVG favicon.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

export const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
};
