// HTML renderer for the landing page and the standalone demo. Pure functions: content in, HTML string out.
import { DEMO_LANGS, DEMO_PARAGRAPHS } from "./content/demo.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const MARK = `<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><polygon fill="currentColor" points="96,50 82.5,63.5 82.5,82.5 63.5,82.5 50,96 36.5,82.5 17.5,82.5 17.5,63.5 4,50 17.5,36.5 17.5,17.5 36.5,17.5 50,4 63.5,17.5 82.5,17.5 82.5,36.5"/><rect x="30" y="37" width="40" height="6" rx="3" fill="var(--ground)" opacity=".75"/><rect x="35" y="47" width="30" height="6" rx="3" fill="#d4a03c"/><rect x="33" y="57" width="34" height="6" rx="3" fill="var(--ground)" opacity=".75"/></svg>`;

const FAVICON = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpolygon fill='%231e6b58' points='96,50 82.5,63.5 82.5,82.5 63.5,82.5 50,96 36.5,82.5 17.5,82.5 17.5,63.5 4,50 17.5,36.5 17.5,17.5 36.5,17.5 50,4 63.5,17.5 82.5,17.5 82.5,36.5'/%3E%3Crect x='28' y='35' width='44' height='8' rx='4' fill='%23fff' opacity='.55'/%3E%3Crect x='33' y='46' width='34' height='8' rx='4' fill='%23d4a03c'/%3E%3Crect x='31' y='57' width='38' height='8' rx='4' fill='%23fff' opacity='.55'/%3E%3C/svg%3E`;

const ICONS = {
  box: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="16" width="36" height="16" rx="3"/><circle cx="14" cy="24" r="2" fill="currentColor" stroke="none"/><path d="M20 24h16"/></svg>`,
  wifi: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 20c10-9 26-9 36 0"/><path d="M12 27c7-6 17-6 24 0"/><path d="M18 34c3.5-3 8.5-3 12 0"/><circle cx="24" cy="40" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  screen: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="9" width="38" height="24" rx="3"/><path d="M18 40h12M24 33v7"/></svg>`,
  tablet: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="6" width="30" height="36" rx="4"/><circle cx="24" cy="37" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  phone: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="14" y="5" width="20" height="38" rx="4"/><path d="M21 9h6"/></svg>`,
  projector: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="16" width="36" height="16" rx="4"/><circle cx="30" cy="24" r="5"/><path d="M12 32v5M36 32v5"/></svg>`,
  cloud: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 36h20a8 8 0 0 0 1-16 11 11 0 0 0-21 3 7 7 0 0 0 0 13z"/></svg>`,
  github: `<svg viewBox="0 0 16 16" aria-hidden="true" class="gh"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
};

function head(t, o, { title, description, path, altPath, demo = false, canonicalPath }) {
  // Self-hosted fonts (assets/fonts, see tools/fetch-fonts.mjs). Preload only the heading face; everything else swaps in.
  const preloadFonts = t.lang === "ar" ? ["noto-kufi-arabic-arabic-800.woff2"] : ["bricolage-grotesque-latin-800.woff2"];
  const enPath = t.lang === "en" ? path : altPath;
  const arPath = t.lang === "ar" ? path : altPath;
  return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}" data-page="${demo ? "demo" : "landing"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${o.site}${canonicalPath}">
<link rel="alternate" hreflang="en" href="${o.site}${enPath}">
<link rel="alternate" hreflang="ar" href="${o.site}${arPath}">
<link rel="alternate" hreflang="x-default" href="${o.site}${arPath}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${o.site}${canonicalPath}">
<meta property="og:image" content="${o.site}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${t.lang === "ar" ? "ar_SA" : "en_US"}">
<meta property="og:site_name" content="Jumaah">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${o.site}/assets/og.png">
<meta name="theme-color" content="#1e6b58">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Jumaah",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Linux (Docker), any browser for displays",
    softwareVersion: o.app.version,
    license: `${o.app.repo}/blob/main/LICENSE`,
    url: o.site,
    downloadUrl: o.app.getUrl,
    description,
    inLanguage: t.lang,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  })}</script>
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="180x180" href="/assets/apple-touch-icon.png">
${preloadFonts.map((f) => `<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/${f}" crossorigin>`).join("\n")}
<style>${o.fontsCss}${o.css}</style>
<script type="application/json" id="jumaah-data">${JSON.stringify({ lang: t.lang, dir: t.dir, fontsExtra: o.fontsExtra, turnstileSiteKey: o.turnstileSiteKey, langs: DEMO_LANGS, paragraphs: DEMO_PARAGRAPHS, i18n: { hero: t.hero, offline: t.offline, demoPage: t.demoPage, status: t.cta.status, languages: t.languages } }).replace(/</g, "\\u003c")}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" defer></script>
<script src="/assets/site.js?v=${o.assetVersion || "1"}" defer></script>
${demo ? "" : `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>`}
</head>
<body>`;
}

function brand(t, href = t.path) {
  return `<a class="brand" href="${href}" aria-label="Jumaah">${MARK}<span class="brand-en">Jumaah</span><span class="brand-ar" lang="ar">جمعة</span></a>`;
}

function navbar(t, o) {
  return `<header class="nav wrap">
  ${brand(t)}
  <nav class="nav-links" aria-label="Sections">
    <a href="#how">${t.nav.how}</a><a href="#quran">${t.nav.features}</a><a href="${t.installPath}">${t.nav.install}</a><a href="#faq">${t.nav.faq}</a><a href="#contact">${t.nav.contact}</a>
  </nav>
  <div class="nav-right">
    <a class="lang-switch" href="${t.altPath}" hreflang="${t.lang === "ar" ? "en" : "ar"}" lang="${t.lang === "ar" ? "en" : "ar"}">${t.altLabel}</a>
    <a class="btn btn-primary btn-sm" href="${o.app.getUrl}" rel="noopener">${t.nav.cta}</a>
  </div>
</header>`;
}

/** The mosque display + imam control. `id` scopes the JS instance. */
function demoStage(t, { id, langTabs = null, cloudRow = false }) {
  const h = t.hero;
  const first = DEMO_PARAGRAPHS[0];
  const dp = t.demoPage;
  return `<div class="stage" id="${id}" data-demo>
  <div class="display" data-display>
    <div class="display-top">
      <span>${esc(h.display.mosque)}</span>
      <span class="live" data-live><i></i>${h.display.live} · <b data-ms>—</b> ms</span>
    </div>
    ${cloudRow ? `<div class="netbar" data-netbar><span data-net-label>${dp.online}</span><span class="netbar-local" data-net-local hidden>${dp.stillLive}</span></div>` : ""}
    <div class="display-ar" lang="ar" data-ar>${esc(first.ar)}</div>
    <div class="display-body">
      <span class="display-tag" data-tag hidden>${h.display.quran}</span>
      <div class="display-tr" data-tr lang="en" dir="ltr">${esc(first.en)}</div>
      <span class="display-src" data-src hidden></span>
    </div>
    <div class="display-bottom"><div class="bar"><i data-bar style="width:${100 / DEMO_PARAGRAPHS.length}%"></i></div><span data-counter>1 / ${DEMO_PARAGRAPHS.length}</span></div>
  </div>
  ${langTabs ? `<div class="tabs" role="tablist" aria-label="${esc(t.demoPage.language)}" data-lang-tabs>${langTabs.map((l, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-lang="${l.code}" lang="${l.code}">${l.label}</button>`).join("")}</div>` : ""}
  <div class="control" data-control>
    <div class="control-head"><span class="control-title">${h.control.title}</span><span class="control-section">${esc(dp.section)}</span></div>
    <div class="control-count">${h.control.paragraph} <b data-count>1</b> ${h.control.of} ${DEMO_PARAGRAPHS.length}</div>
    <div class="control-btns">
      <button type="button" class="ctl ctl-prev" data-prev>${h.control.prev}</button>
      <button type="button" class="ctl ctl-next" data-next>${h.control.next}</button>
    </div>
    <span class="control-hint">${h.control.hint}</span>
  </div>
</div>`;
}

function section(id, cls, inner) {
  return `<section id="${id}" class="${cls}"><div class="wrap">${inner}</div></section>`;
}
const eyebrow = (s) => `<span class="eyebrow">${esc(s)}</span>`;

function landingBody(t, o) {
  const { how, demo, quran, offline, features, languages, phone, install, free, hadith, faq, reliability, cta } = t;
  const isAr = t.lang === "ar";
  const langDemoParagraph = DEMO_PARAGRAPHS[1];

  const hero = `<section id="top" class="hero"><canvas class="stars" data-stars aria-hidden="true"></canvas><div class="wrap hero-grid">
  <div class="hero-copy">
    <h1>${esc(t.hero.h1)}</h1>
    <p class="lede">${esc(t.hero.lede)}</p>
    <div class="ctas"><a class="btn btn-primary" href="${o.app.getUrl}" rel="noopener">${ICONS.github}${t.hero.cta1}</a><a class="btn btn-ghost" href="${t.demoPath}">${t.hero.cta2}</a></div>
    <ul class="tags">${t.hero.tags.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  </div>
  ${demoStage(t, { id: "heroDemo" })}
  <p class="measured">${esc(t.hero.display.measured)}</p>
</div></section>`;

  const howS = section("how", "how", `${eyebrow(how.eyebrow)}<h2>${esc(how.h2)}</h2>
<ol class="timeline">${how.steps.map((s, i) => `<li><span class="tl-dot">${i + 1}</span><b>${esc(s.title)}</b><span>${esc(s.line)}</span></li>`).join("")}</ol>`);

  const demoS = section("demo", "demo-teaser", `<div class="teaser-row">
  <div>${eyebrow(demo.eyebrow)}<h2>${esc(demo.h2)}</h2><p>${esc(demo.line)}</p></div>
  <a class="btn btn-primary" href="${t.demoPath}">${demo.cta}</a>
</div>`);

  const quranS = section("quran", "quran", `${eyebrow(quran.eyebrow)}<h2>${esc(quran.h2)}</h2>
<div class="flows">
  <div class="flow">
    <div class="flow-card verse"><span class="chip chip-saffron">${esc(quran.flow.verseTag)}</span><span lang="ar" class="ar">${esc(DEMO_PARAGRAPHS[2].ar)}</span></div>
    <ol class="flow-steps"><li>${esc(quran.flow.detected)}</li><li class="lock">${esc(quran.flow.excluded)}</li><li>${esc(quran.flow.published)}</li><li>${esc(quran.flow.approved)}</li><li class="end">${esc(quran.flow.shown)}</li></ol>
  </div>
  <div class="flow">
    <div class="flow-card"><span class="chip">${esc(quran.flow.draft)}</span><span lang="ar" class="ar">${esc(DEMO_PARAGRAPHS[3].ar)}</span></div>
    <ol class="flow-steps"><li>${esc(quran.flow.draft)}</li><li>${esc(quran.flow.approved)}</li><li class="end">${esc(quran.flow.shown)}</li></ol>
  </div>
</div>
<div class="cols3">
  <div><h3>${esc(quran.quranTitle)}</h3><ul>${quran.quranPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
  <div><h3>${esc(quran.hadithTitle)}</h3><ul>${quran.hadithPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
  <div><h3>${esc(quran.reviewTitle)}</h3><ul>${quran.reviewPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>
</div>`);

  const n = offline.nodes;
  const node = (icon, label, key) => `<div class="node" data-node="${key}">${ICONS[icon]}<b>${esc(label)}</b><span class="pill pill-on" data-status>${esc(n.active)}</span></div>`;
  const offlineS = section("offline", "offline", `${eyebrow(offline.eyebrow)}<h2>${esc(offline.h2)}</h2><p class="lede-sm">${esc(offline.line)}</p>
<div class="diagram" data-offline>
  <div class="boundary"><span class="boundary-label">${esc(n.boundary)}</span>
    <div class="net-grid">
      ${node("tablet", n.imam, "imam")}
      <div class="node node-box" data-node="box">${ICONS.box}<b>${esc(n.box)}</b><span class="pill pill-on" data-status>${esc(n.active)}</span><span class="pill pill-local" data-local hidden>${esc(n.stillLive)}</span></div>
      <div class="node-stack">${node("screen", n.displays, "displays")}${node("projector", n.projectors, "projectors")}${node("phone", n.phones, "phones")}</div>
    </div>
  </div>
  <div class="link" data-link><i></i></div>
  <div class="node node-cloud" data-node="cloud">${ICONS.cloud}<b>${esc(n.cloud)}</b><small>${esc(n.cloudSub)}</small><span class="pill pill-on" data-status>${esc(n.active)}</span></div>
</div>
<label class="switch"><input type="checkbox" data-offline-toggle><span class="sw"></span><span>${esc(offline.toggle)}</span></label>`);

  const featuresS = section("features", "features", `${eyebrow(features.eyebrow)}
<div class="cards6">${features.cards.map((c) => `<div class="card"><b>${esc(c.title)}</b><span>${esc(c.line)}</span></div>`).join("")}</div>`);

  const langS = section("languages", "languages", `${eyebrow(languages.eyebrow)}<h2>${esc(languages.h2)}</h2><p class="lede-sm">${esc(languages.line)}</p>
<div class="langdemo" data-langdemo>
  <div class="tabs" role="tablist">${DEMO_LANGS.map((l, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-lang="${l.code}" lang="${l.code}">${l.label}</button>`).join("")}</div>
  <div class="display display-static">
    <div class="display-top"><span>${esc(t.hero.display.mosque)}</span><span class="live"><i></i>${t.hero.display.live}</span></div>
    <div class="display-ar" lang="ar">${esc(langDemoParagraph.ar)}</div>
    <div class="display-body"><div class="display-tr" data-tr lang="en" dir="ltr">${esc(langDemoParagraph.en)}</div></div>
  </div>
</div>`);

  const phoneS = section("phone", "phone", `<div class="phone-grid">
  <div>${eyebrow(phone.eyebrow)}<h2>${esc(phone.h2)}</h2>
    <ol class="flow-steps vertical">${phone.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
    <p class="noapp">${esc(phone.noApp)}</p>
    <figure class="qr"><img src="/assets/qr-demo.svg" width="160" height="160" alt="QR code linking to ${o.site}/demo"><figcaption>${esc(phone.qrCaption)}</figcaption></figure>
  </div>
  <div class="phone-mock" aria-hidden="true">
    <div class="phone-screen">
      <div class="ps-top"><span class="live"><i></i>${t.hero.display.live}</span><span>${esc(t.hero.display.mosque)}</span></div>
      <div class="ps-langs">${DEMO_LANGS.map((l, i) => `<span class="${i === 1 ? "on" : ""}" lang="${l.code}">${l.label}</span>`).join("")}</div>
      <div class="ps-text" lang="ur" dir="rtl">${esc(langDemoParagraph.ur)}</div>
      <div class="ps-foot">${esc(phone.mock.following)}</div>
    </div>
  </div>
</div>`);

  const installS = section("install", "install", `${eyebrow(install.eyebrow)}<h2>${esc(install.h2)}</h2>
<ol class="timeline three">${install.steps.map((s, i) => `<li><span class="tl-dot">${i + 1}</span><b>${esc(s.title)}</b><span>${esc(s.line)}</span></li>`).join("")}</ol>
<p class="install-more"><a class="btn btn-ghost" href="${t.installPath}">${esc(t.installPage.h1)}</a></p>`);

  const freeS = section("free", "free", `${eyebrow(free.eyebrow)}<h2>${esc(free.h2)}</h2><p class="free-line">${esc(free.line)}</p>
<details class="why"><summary>${esc(free.why)}</summary><p>${esc(free.whyBody)}</p></details>`);

  const hadithS = `<section id="hadith" class="hadith"><div class="wrap">
  <p class="hadith-ar" lang="ar" dir="rtl">${esc(hadith.ar)}</p>
  ${hadith.text ? `<p class="hadith-tr">${esc(hadith.text)}</p>` : ""}
  <span class="hadith-src">${esc(hadith.source)}</span>
</div></section>`;

  const proofS = o.socialProof && o.socialProof.counters
    ? section("proof", "proof", `${eyebrow(t.proof.eyebrow)}
<div class="counters">${Object.entries(t.proof.counters).map(([k, label]) => `<div><b>${esc(o.socialProof.counters[k] ?? "")}</b><span>${esc(label)}</span></div>`).join("")}</div>
${o.socialProof.testimonial ? `<blockquote class="quote"><p>${esc(o.socialProof.testimonial.text)}</p><cite>${esc(o.socialProof.testimonial.who)}</cite></blockquote>` : ""}
${o.socialProof.photos.length ? `<div class="photos">${o.socialProof.photos.map((p) => `<img src="${esc(p.src)}" alt="${esc(p.alt)}" loading="lazy">`).join("")}</div>` : ""}`)
    : "";

  const faqS = section("faq", "faq", `${eyebrow(faq.eyebrow)}<h2>${esc(faq.h2)}</h2>
<div class="faq-list">${faq.items.map((it, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(it.q)}</summary><p>${esc(it.a)}</p></details>`).join("")}</div>`);

  const relS = section("reliability", "reliability", `${eyebrow(reliability.eyebrow)}<ul class="chips">${reliability.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
<div class="repo-row">
  <a class="repo" href="${o.app.repo}" rel="noopener">${ICONS.github}<span>${esc(t.repo.label)}</span><span class="chip">${esc(t.repo.version)} ${esc(o.app.version)}</span></a>
  <a class="repo" href="${o.app.issues}" rel="noopener"><span>${esc(t.repo.issues)}</span></a>
  <a class="repo" href="${o.app.repo}/blob/main/LICENSE" rel="noopener"><span>${esc(t.repo.license)} ${esc(o.app.license)}</span></a>
</div>`);

  const ctaS = `<section id="contact" class="cta"><div class="wrap cta-grid">
  <div><h2>${esc(cta.h2)}</h2>
    <a class="btn btn-primary btn-get" href="${o.app.getUrl}" rel="noopener">${ICONS.github}${esc(cta.get)}</a>
    <p class="cta-sub">${esc(cta.sub)}</p></div>
  <form class="contact" id="contactForm" novalidate data-contact>
    <h3>${esc(cta.form.title)}</h3>
    <div class="field"><label for="c-mosque">${esc(cta.form.mosque)}</label><input id="c-mosque" name="mosque" type="text" required maxlength="160" autocomplete="organization"></div>
    <div class="field"><label for="c-contact">${esc(cta.form.contact)}</label><input id="c-contact" name="contact" type="text" required maxlength="200" inputmode="email" dir="ltr"></div>
    <div class="field"><label for="c-question">${esc(cta.form.question)}</label><textarea id="c-question" name="question" required maxlength="3000" rows="4"></textarea></div>
    <div class="hp" aria-hidden="true"><label for="c-web">Website</label><input id="c-web" name="website" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="started" value=""><input type="hidden" name="lang" value="${t.lang}">
    <div class="turnstile" data-turnstile></div>
    <button class="btn btn-primary" type="submit">${esc(cta.form.submit)}</button>
    <span class="form-status" role="status" aria-live="polite"></span>
    <span class="fine">${esc(cta.form.fine)}</span>
  </form>
</div></section>`;

  const footer = `<footer class="wrap footer"><span>${esc(t.footer.line)} · <a href="${o.app.repo}" rel="noopener">GitHub</a> · v${esc(o.app.version)} · ${esc(o.app.license)}</span><span><a href="#contact">${esc(t.footer.contact)}</a> · <a href="${t.altPath}" lang="${isAr ? "en" : "ar"}">${t.altLabel}</a></span></footer>`;

  void featuresS; // feature cards restated other sections; kept in content for a future use, not rendered
  return [hero, howS, demoS, quranS, offlineS, langS, phoneS, installS, freeS, hadithS, proofS, faqS, relS, ctaS, footer].join("\n");
}

export function renderLanding(t, o) {
  return `${head(t, o, { title: t.title, description: t.description, path: t.path, altPath: t.altPath, canonicalPath: t.path })}
${navbar(t, o)}
<main>
${landingBody(t, o)}
</main>
</body>
</html>
`;
}

/** Install guide for the mosque admin: /install (Arabic) and /en/install. */
export function renderInstall(t, o) {
  const ip = t.installPage;
  const altInstall = t.lang === "ar" ? "/en/install" : "/install";
  const code = (c) => c ? `<div class="code"><pre><code>${esc(c)}</code></pre><button type="button" class="copy" data-copy data-copied="${esc(ip.copied)}">${esc(ip.copy)}</button></div>` : "";
  return `${head(t, o, { title: ip.title, description: ip.lede, path: t.installPath, altPath: altInstall, demo: true, canonicalPath: t.installPath })}
<header class="nav wrap">
  ${brand(t)}
  <div class="nav-right"><a class="lang-switch" href="${altInstall}" lang="${t.lang === "ar" ? "en" : "ar"}">${t.altLabel}</a><a class="btn btn-ghost btn-sm" href="${t.path}">${esc(t.demoPage.back)}</a></div>
</header>
<main class="install-page wrap">
  <h1>${esc(ip.h1)}</h1>
  <p class="lede">${esc(ip.lede)}</p>

  <h2>${esc(ip.needTitle)}</h2>
  <div class="need">${ip.need.map((n, i) => `<div class="part">${ICONS[["box", "wifi", "screen", "tablet"][i]]}<b>${esc(n.title)}</b><span>${esc(n.line)}</span></div>`).join("")}</div>

  <ol class="steps-list">${ip.steps.map((s, i) => `<li><span class="tl-dot">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${code(s.code)}</div></li>`).join("")}</ol>

  <h2>${esc(ip.optionalTitle)}</h2>
  <div class="optional">${ip.optional.map((s) => `<div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>${code(s.code)}</div>`).join("")}</div>

  <div class="help-box"><h3>${esc(ip.helpTitle)}</h3><p>${esc(ip.helpBody)}</p><a class="btn btn-primary" href="${t.path}#contact">${esc(ip.helpCta)}</a></div>
</main>
<footer class="wrap footer"><span>${esc(t.footer.line)} · <a href="${o.app.repo}" rel="noopener">GitHub</a> · v${esc(o.app.version)}</span><a href="${t.path}">${esc(t.demoPage.back)}</a></footer>
</body>
</html>
`;
}

/** Bilingual 404 page. Served by the Node server for unknown paths and picked up by Cloudflare Pages as 404.html. */
export function renderNotFound(ar, en, o) {
  return `${head(ar, o, { title: "404 · جمعة", description: ar.description, path: "/404", altPath: "/en/", canonicalPath: "/" })}
<main class="notfound wrap">
  <p class="eyebrow">404</p>
  <h1 lang="ar" dir="rtl">الصفحة غير موجودة.</h1>
  <p class="lede" lang="ar" dir="rtl">ربما تغيّر الرابط. الصفحة الرئيسية والتجربة الحية ما زالتا هنا.</p>
  <div class="ctas"><a class="btn btn-primary" href="/">الصفحة الرئيسية</a><a class="btn btn-ghost" href="/demo">التجربة الحية</a></div>
  <hr>
  <h2 lang="en" dir="ltr">Page not found.</h2>
  <p class="lede-sm" lang="en" dir="ltr">The link may have changed. The home page and the live demo are still here.</p>
  <div class="ctas" dir="ltr"><a class="btn btn-ghost" href="/en/">English home</a><a class="btn btn-ghost" href="/en/demo">Live demo</a></div>
</main>
</body>
</html>
`;
}

export function renderDemo(t, o) {
  const dp = t.demoPage;
  const demoLangs = DEMO_LANGS.filter((l) => ["en", "ur", "bn"].includes(l.code));
  const altDemo = t.lang === "ar" ? "/en/demo" : "/demo";
  return `${head(t, o, { title: dp.title, description: t.description, path: t.demoPath, altPath: altDemo, demo: true, canonicalPath: t.demoPath })}
<header class="nav wrap">
  ${brand(t)}
  <div class="nav-right"><a class="lang-switch" href="${altDemo}" lang="${t.lang === "ar" ? "en" : "ar"}">${t.altLabel}</a><a class="btn btn-ghost btn-sm" href="${t.path}">${esc(dp.back)}</a></div>
</header>
<main class="demo-page">
  <div class="wrap">
    <h1>${esc(dp.h1)}</h1>
    <p class="lede">${esc(dp.lede)}</p>
    <div class="demo-layout">
      ${demoStage(t, { id: "fullDemo", langTabs: demoLangs, cloudRow: true })}
      <div class="demo-side">
        <label class="switch"><input type="checkbox" data-net-toggle><span class="sw"></span><span>${esc(dp.internet)}</span></label>
        <div class="cloud-state"><span>${esc(dp.cloud)}</span><b data-cloud-state>${esc(dp.synced)}</b></div>
        <p class="measured">${esc(t.hero.display.measured)}</p>
        <a class="btn btn-primary" href="${o.app.getUrl}" rel="noopener">${ICONS.github}${esc(t.hero.cta1)}</a>
      </div>
    </div>
  </div>
</main>
<footer class="wrap footer"><span>${esc(t.footer.line)}</span><a href="${t.path}">${esc(dp.back)}</a></footer>
</body>
</html>
`;
}
