/**
 * Self-hosted server for the Jumaah site (Docker / NAS).
 * Serves the built site from dist/ with clean URLs (/ Arabic, /en, /demo, /en/demo) and handles POST /api/contact.
 *
 * Environment:
 *   PORT                  default 8080
 *   TURNSTILE_SECRET_KEY  required
 *   RESEND_API_KEY        required
 *   TO_EMAIL              optional (defaults to malkurbi5@gmail.com)
 *   FROM_EMAIL            optional
 *   TRUST_PROXY           "1" when behind Nginx Proxy Manager (reads X-Forwarded-For / X-Forwarded-Host)
 */
import http from "node:http";
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleSubmission, MAX_PER_HOUR } from "./shared/submit.mjs";
import { SECURITY_HEADERS } from "./shared/headers.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 8080;
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const MAX_BODY = 64 * 1024;

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".json": "application/json", ".woff2": "font/woff2", ".woff": "font/woff" };
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

const hits = new Map();
async function rateLimit(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (list.length >= MAX_PER_HOUR) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const l = v.filter((t) => now - t < 3600_000); l.length ? hits.set(k, l) : hits.delete(k); } }, 600_000).unref();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "cache-control": "no-store", ...headers });
  res.end(body);
}
function sendJson(res, status, obj) { send(res, status, JSON.stringify(obj), { "content-type": "application/json; charset=utf-8" }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
function clientIp(req) {
  if (TRUST_PROXY) {
    const xff = req.headers["x-forwarded-for"];
    if (xff) return String(xff).split(",")[0].trim();
    if (req.headers["x-real-ip"]) return String(req.headers["x-real-ip"]);
  }
  return req.socket.remoteAddress || "";
}

// Clean URL → file in dist. Directories resolve to their index.html.
function resolveFile(pathname) {
  let p = decodeURIComponent(pathname);
  if (p.includes("..") || p.includes("\0")) return null;
  // Arabic is the default at /; old /ar URLs keep working
  if (p === "/ar" || p === "/ar/") return { redirect: "/" };
  if (p === "/ar/demo" || p === "/ar/demo/") return { redirect: "/demo" };
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  const direct = path.join(DIST, p);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return { file: direct, rel: p };
  const index = path.join(direct, "index.html");
  if (fs.existsSync(index)) return { file: index, rel: p + "/index.html" };
  return null;
}
function encode(req, data, type, headers) {
  const accept = String(req.headers["accept-encoding"] || "");
  if (!COMPRESSIBLE.test(type) || data.length <= 1024) return data;
  if (/\bbr\b/.test(accept)) { headers["content-encoding"] = "br"; return zlib.brotliCompressSync(data); }
  if (/\bgzip\b/.test(accept)) { headers["content-encoding"] = "gzip"; return zlib.gzipSync(data); }
  return data;
}
function serveFile(req, res, { file, rel }, { status = 200, headOnly = false } = {}) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found", { "content-type": "text/plain" });
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    // Assets are content-hashed in their URLs, so they can cache for a week; HTML must revalidate so a redeploy shows immediately
    const cache = rel.startsWith("/assets/") ? "public, max-age=604800, immutable" : "no-cache";
    const headers = { ...SECURITY_HEADERS, "content-type": type, "cache-control": cache, vary: "accept-encoding" };
    const out = encode(req, data, type, headers);
    headers["content-length"] = out.length;
    res.writeHead(status, headers);
    res.end(headOnly ? undefined : out);
  });
}
function notFound(req, res) {
  const page = path.join(DIST, "404.html");
  if (fs.existsSync(page)) return serveFile(req, res, { file: page, rel: "/404.html" }, { status: 404, headOnly: req.method === "HEAD" });
  send(res, 404, "Not found", { "content-type": "text/plain" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (p === "/api/contact") {
      if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method" });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: "bad_json" }); }
      const host = TRUST_PROXY && req.headers["x-forwarded-host"] ? String(req.headers["x-forwarded-host"]) : String(req.headers.host || "");
      const { status, data } = await handleSubmission({
        body, origin: String(req.headers.origin || ""), host, ip: clientIp(req),
        country: String(req.headers["cf-ipcountry"] || ""), userAgent: String(req.headers["user-agent"] || ""),
        env: process.env, rateLimit,
      });
      return sendJson(res, status, data);
    }
    if (p.startsWith("/api/")) return sendJson(res, 404, { ok: false, error: "not_found" });

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", { "content-type": "text/plain", allow: "GET, HEAD" });
    if (p === "/healthz") return send(res, 200, "ok", { "content-type": "text/plain" });
    let hit = null;
    try { hit = resolveFile(p); } catch { return send(res, 400, "Bad request", { "content-type": "text/plain" }); }
    if (!hit) return notFound(req, res);
    if (hit.redirect) return send(res, 301, "", { location: hit.redirect });
    serveFile(req, res, hit, { headOnly: req.method === "HEAD" });
  } catch (err) {
    console.error("request failed:", err && err.message);
    if (!res.headersSent) send(res, 500, "Server error", { "content-type": "text/plain" });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Jumaah site on http://0.0.0.0:${PORT} serving ${DIST} (trust proxy: ${TRUST_PROXY})`);
  if (!fs.existsSync(path.join(DIST, "index.html"))) console.warn("Warning: dist/ is empty. Run `node build.mjs` first.");
  if (!process.env.TURNSTILE_SECRET_KEY || !process.env.RESEND_API_KEY) console.warn("Warning: TURNSTILE_SECRET_KEY or RESEND_API_KEY is not set; the contact form will fail.");
});
