// Builds the static site into dist/: / (Arabic), /en/, /demo, /en/demo, assets, robots and sitemap.
// Usage: node build.mjs            (SOCIAL_PROOF=1 to include the social-proof section, only with real data)
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import en from "./src/content/en.mjs";
import ar from "./src/content/ar.mjs";
import { renderLanding, renderDemo, renderInstall, renderNotFound } from "./src/render.mjs";
import { SECURITY_HEADERS } from "./shared/headers.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const SITE = process.env.SITE_URL || "https://www.jumaah.net";
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEnoefxWxSINTxqJ";
const SOCIAL_PROOF = process.env.SOCIAL_PROOF === "1";

// App version shown next to the GitHub link. Read from the repo root package.json (this folder lives at Jumaah/website),
// otherwise from APP_VERSION (Docker build arg). Bump FALLBACK when neither is available.
const FALLBACK_VERSION = "1.0.0";
function readAppVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "..", "package.json"), "utf8")).version || FALLBACK_VERSION; } catch { return FALLBACK_VERSION; }
}
const REPO = "https://github.com/iModyHK/Jumaah";
const APP = {
  version: readAppVersion(),
  repo: REPO,
  getUrl: `${REPO}#deploying-on-a-mosque-server-edge`, // "Get it now" lands on the install section of the README
  issues: `${REPO}/issues`,
  license: "MIT",
};

// Real data only. Leave empty until it exists; the section is never rendered with placeholders.
const social = { photos: [], testimonial: null, counters: null };

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const write = (rel, html) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};

// Content hash of CSS+JS so browsers and proxies drop stale copies after each deploy
const assetVersion = createHash("sha1")
  .update(fs.readFileSync(path.join(ROOT, "src", "assets", "site.css")))
  .update(fs.readFileSync(path.join(ROOT, "src", "assets", "site.js")))
  .digest("hex").slice(0, 8);
const css = fs.readFileSync(path.join(ROOT, "src", "assets", "site.css"), "utf8");

// Fonts: only the faces a page's first paint needs are inlined; the rest (other scripts, extra weights, latin-ext)
// go into a per-language stylesheet that site.js attaches after parsing, so slow connections paint text immediately.
const fontBlocks = [...fs.readFileSync(path.join(ROOT, "src", "assets", "fonts.css"), "utf8").matchAll(/\/\* (\w[\w-]*) \*\/\n(@font-face \{[^}]*\})/g)]
  .map(([, subset, rule]) => ({ subset, rule, family: /font-family: '([^']+)'/.exec(rule)[1], weight: /font-weight: (\d+)/.exec(rule)[1] }));
// Only the preloaded heading face is inlined. Every other face arrives via the deferred stylesheet and swaps in,
// which is what keeps first paint fast on slow phones (measured: inlining body faces added ~2 s to LCP on simulated 4G).
const CRITICAL = {
  en: [["Bricolage Grotesque", "latin", "800"]],
  ar: [["Noto Kufi Arabic", "arabic", "800"]],
};
const isCritical = (lang, b) => CRITICAL[lang].some(([fam, sub, w]) => b.family === fam && b.subset === sub && (!w || b.weight === w));
const fontsFor = (lang) => ({
  inline: "/* Self-hosted fonts, SIL OFL 1.1. Critical faces only; the rest load from fonts-extra. */\n" + fontBlocks.filter((b) => isCritical(lang, b)).map((b) => b.rule).join("\n") + "\n",
  extra: fontBlocks.filter((b) => !isCritical(lang, b)).map((b) => `/* ${b.subset} */\n${b.rule}`).join("\n") + "\n",
});
const baseOpts = { site: SITE, turnstileSiteKey: TURNSTILE_SITE_KEY, socialProof: SOCIAL_PROOF ? social : null, assetVersion, css, app: APP };
const optsFor = (lang) => ({ ...baseOpts, fontsCss: fontsFor(lang).inline, fontsExtra: `/assets/fonts-extra-${lang}.css?v=${assetVersion}` });
const opts = optsFor("ar");
const optsEn = optsFor("en");
// Arabic is the default site: / and /demo. English lives under /en/.
write("index.html", renderLanding(ar, opts));
write("en/index.html", renderLanding(en, optsEn));
write("demo/index.html", renderDemo(ar, opts));
write("en/demo/index.html", renderDemo(en, optsEn));
write("install/index.html", renderInstall(ar, opts));
write("en/install/index.html", renderInstall(en, optsEn));
write("404.html", renderNotFound(ar, en, opts));
write("assets/fonts-extra-ar.css", fontsFor("ar").extra);
write("assets/fonts-extra-en.css", fontsFor("en").extra);

// Assets: hand-written CSS/JS from src plus images from assets/ (the OG card template itself is not published)
fs.cpSync(path.join(ROOT, "src", "assets"), path.join(DIST, "assets"), { recursive: true });
fs.cpSync(path.join(ROOT, "assets"), path.join(DIST, "assets"), { recursive: true, filter: (src) => !src.endsWith(".html") });

write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`);

// RFC 9116 security contact
const expires = new Date(Date.now() + 365 * 86400e3).toISOString().replace(/\.\d{3}Z$/, "Z");
write(".well-known/security.txt", [
  "Contact: https://github.com/iModyHK/Jumaah/security/advisories/new",
  "Contact: mailto:malkurbi5@gmail.com",
  `Expires: ${expires}`,
  "Preferred-Languages: ar, en",
  `Canonical: ${SITE}/.well-known/security.txt`,
  "Policy: https://github.com/iModyHK/Jumaah/blob/main/SECURITY.md",
  "",
].join("\n"));

// Cloudflare Pages: same security headers as the Node server, plus cache rules
write("_headers", [
  "/*",
  ...Object.entries(SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`),
  "  Cache-Control: no-cache",
  "/assets/*",
  "  Cache-Control: public, max-age=604800, immutable",
  "",
].join("\n"));
write("_redirects", "/ar / 301\n/ar/ / 301\n/ar/demo /demo 301\n");
const urls = ["/", "/en/", "/demo", "/en/demo", "/install", "/en/install"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`);

// Single-file variant of the default (Arabic) landing page for review links (artifact viewers cannot serve /assets).
const js = fs.readFileSync(path.join(ROOT, "src", "assets", "site.js"), "utf8");
const qr = "data:image/svg+xml;base64," + fs.readFileSync(path.join(ROOT, "assets", "qr-demo.svg")).toString("base64");
const single = fs.readFileSync(path.join(DIST, "index.html"), "utf8")
  .replace(`<script src="/assets/site.js?v=${assetVersion}" defer></script>`, `<script defer>${js}</script>`)
  .replace(/\/assets\/qr-demo\.svg/g, qr)
  .replace(/href="\/demo"/g, `href="${SITE}/demo"`).replace(/href="\/en\/"/g, `href="${SITE}/en/"`).replace(/href="\/install"/g, `href="${SITE}/install"`)
  .replace(/"fontsExtra":"\/assets\//, `"fontsExtra":"${SITE}/assets/`).replace(/url\(\/assets\/fonts\//g, `url(${SITE}/assets/fonts/`).replace(/href="\/assets\/fonts\//g, `href="${SITE}/assets/fonts/`);
write("single/index.html", single);

console.log(`Built ${urls.length} pages into dist/ (social proof: ${SOCIAL_PROOF ? "on" : "off"})`);
