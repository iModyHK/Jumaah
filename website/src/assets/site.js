/* Jumaah site script: interactive demos, offline diagram, language tabs, contact form. No dependencies. */
(function () {
  "use strict";
  // Copy buttons on the install page
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var code = b.parentNode.querySelector("code"); if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(function () { var t = b.textContent; b.textContent = b.getAttribute("data-copied") || "✓"; setTimeout(function () { b.textContent = t; }, 1500); });
    });
  });
  var J = {};
  try { J = JSON.parse(document.getElementById("jumaah-data").textContent); } catch (e) { return; }
  // Remaining web fonts (other scripts, extra weights) load after parsing so first paint never waits on them
  if (J.fontsExtra) { var fl = document.createElement("link"); fl.rel = "stylesheet"; fl.href = J.fontsExtra; document.head.appendChild(fl); }
  var P = J.paragraphs || [], LANGS = J.langs || [];
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function langMeta(code) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i]; return LANGS[0]; }
  function applyLang(el, code) {
    var m = langMeta(code);
    el.setAttribute("lang", code); el.setAttribute("dir", m.dir);
    el.className = el.className.replace(/\bfont-\w+\b/g, "").trim() + " font-" + m.font;
  }

  /* ---------- Display + imam control ---------- */
  function Demo(stage) {
    var self = this;
    this.idx = 0; this.lang = "en"; this.offline = false;
    this.el = {
      ar: stage.querySelector("[data-ar]"), tr: stage.querySelector("[data-tr]"), tag: stage.querySelector("[data-tag]"), src: stage.querySelector("[data-src]"),
      bar: stage.querySelector("[data-bar]"), counter: stage.querySelector("[data-counter]"), count: stage.querySelector("[data-count]"),
      ms: stage.querySelector("[data-ms]"), live: stage.querySelector("[data-live]"),
      prev: stage.querySelector("[data-prev]"), next: stage.querySelector("[data-next]"), tabs: stage.querySelector("[data-lang-tabs]"),
      netLabel: stage.querySelector("[data-net-label]"), netLocal: stage.querySelector("[data-net-local]"), netbar: stage.querySelector("[data-netbar]"),
    };
    this.el.prev.addEventListener("click", function () { self.go(-1); });
    this.el.next.addEventListener("click", function () { self.go(1); });
    stage.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") self.go(J.dir === "rtl" ? -1 : 1); if (e.key === "ArrowLeft") self.go(J.dir === "rtl" ? 1 : -1); });
    if (this.el.tabs) this.el.tabs.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lang]"); if (!b) return;
      self.lang = b.getAttribute("data-lang");
      self.el.tabs.querySelectorAll("[data-lang]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      self.paint(true);
    });
    this.paint(false);
  }
  Demo.prototype.paint = function (measure) {
    var t0 = measure ? performance.now() : 0;
    var p = P[this.idx], n = P.length, self = this;
    this.el.ar.textContent = p.ar;
    this.el.tr.textContent = p[this.lang] || p.en;
    applyLang(this.el.tr, this.lang);
    var isQuran = p.kind === "QURAN";
    this.el.tag.hidden = !isQuran;
    if (this.el.src) { var src = isQuran && this.lang === "en" ? p.enSource : ""; this.el.src.textContent = src ? "— " + src : ""; this.el.src.hidden = !src; }
    this.el.bar.style.width = ((this.idx + 1) / n * 100) + "%";
    this.el.counter.textContent = (this.idx + 1) + " / " + n;
    this.el.count.textContent = this.idx + 1;
    this.el.prev.disabled = this.idx === 0; this.el.next.disabled = this.idx === n - 1;
    if (measure && !reduce) {
      if (window.gsap) gsap.fromTo([this.el.ar, this.el.tr], { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: "power3.out", stagger: .06, overwrite: true });
      else { this.el.tr.classList.remove("swap"); void this.el.tr.offsetWidth; this.el.tr.classList.add("swap"); }
    }
    if (measure) {
      // Measure from the state update to the frame after the new text is painted, in this browser.
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        var ms = performance.now() - t0;
        self.el.ms.textContent = ms < 10 ? ms.toFixed(1) : Math.round(ms);
        self.el.live.classList.add("tick"); setTimeout(function () { self.el.live.classList.remove("tick"); }, 400);
      }); });
    }
  };
  Demo.prototype.go = function (d) {
    var next = Math.min(Math.max(this.idx + d, 0), P.length - 1);
    if (next === this.idx) return;
    this.idx = next; this.paint(true);
  };
  Demo.prototype.setOffline = function (off) {
    this.offline = off;
    if (this.el.netLabel) this.el.netLabel.textContent = off ? J.i18n.demoPage.offline : J.i18n.demoPage.online;
    if (this.el.netLocal) this.el.netLocal.hidden = !off;
    if (this.el.netbar) this.el.netbar.classList.toggle("is-off", off);
  };

  var demos = {};
  document.querySelectorAll("[data-demo]").forEach(function (s) { demos[s.id] = new Demo(s); });

  // Standalone demo page: internet toggle
  var netToggle = document.querySelector("[data-net-toggle]");
  if (netToggle && demos.fullDemo) {
    var cloudState = document.querySelector("[data-cloud-state]");
    netToggle.addEventListener("change", function () {
      demos.fullDemo.setOffline(netToggle.checked);
      if (cloudState) { cloudState.textContent = netToggle.checked ? J.i18n.demoPage.paused : J.i18n.demoPage.synced; cloudState.classList.toggle("off", netToggle.checked); }
    });
  }

  /* ---------- Languages section: tabs on a static display ---------- */
  var ld = document.querySelector("[data-langdemo]");
  if (ld) {
    var ldTr = ld.querySelector("[data-tr]"), para = P[1];
    ld.addEventListener("click", function (e) {
      var b = e.target.closest("[data-lang]"); if (!b) return;
      var code = b.getAttribute("data-lang");
      ld.querySelectorAll("[data-lang]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      ldTr.textContent = para[code] || para.en; applyLang(ldTr, code);
      if (!reduce) { ldTr.classList.remove("swap"); void ldTr.offsetWidth; ldTr.classList.add("swap"); }
    });
  }

  /* ---------- Offline architecture diagram ---------- */
  var diagram = document.querySelector("[data-offline]"), offToggle = document.querySelector("[data-offline-toggle]");
  if (diagram && offToggle) {
    var o = J.i18n.offline.nodes;
    offToggle.addEventListener("change", function () {
      var off = offToggle.checked;
      diagram.classList.toggle("is-offline", off);
      var cloud = diagram.querySelector('[data-node="cloud"] [data-status]');
      cloud.textContent = off ? o.offline : o.active;
      cloud.className = "pill " + (off ? "pill-off" : "pill-on");
      var local = diagram.querySelector("[data-local]"); if (local) local.hidden = !off;
    });
  }

  /* ---------- Contact form ---------- */
  var form = document.querySelector("[data-contact]");
  if (form) {
    var S = J.i18n.status, status = form.querySelector(".form-status"), btn = form.querySelector('button[type="submit"]');
    var box = form.querySelector("[data-turnstile]"), widget = null;
    form.querySelector('input[name="started"]').value = String(Date.now());
    function say(key, cls) { status.textContent = S[key] || ""; status.className = "form-status " + (cls || ""); }
    function renderTurnstile() {
      if (!window.turnstile || !box) return;
      if (widget != null) { try { turnstile.remove(widget); } catch (e) {} }
      box.innerHTML = "";
      widget = turnstile.render(box, { sitekey: J.turnstileSiteKey, language: J.lang, theme: "auto", size: "flexible" });
    }
    var wait = setInterval(function () { if (window.turnstile) { clearInterval(wait); renderTurnstile(); } }, 200);
    setTimeout(function () { clearInterval(wait); }, 15000);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form), payload = {};
      data.forEach(function (v, k) { payload[k] = v; });
      if (!String(payload.mosque || "").trim() || !String(payload.contact || "").trim() || !String(payload.question || "").trim()) { say("required", "err"); return; }
      if (!payload["cf-turnstile-response"]) { say("captcha", "err"); return; }
      btn.disabled = true; say("sending", "");
      fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j.ok ? "ok" : (j.error === "captcha" ? "captcha" : "err"); }); })
        .catch(function () { return "err"; })
        .then(function (k) {
          say(k, k === "ok" ? "ok" : "err");
          if (k === "ok") { form.reset(); form.querySelector('input[name="started"]').value = String(Date.now()); }
          btn.disabled = false; renderTurnstile();
        });
    });
  }

  /* ---------- Ambient star field behind the hero (Canvas 2D, eight-point stars in pseudo-3D) ---------- */
  (function stars() {
    var cv = document.querySelector("[data-stars]");
    if (!cv || reduce) return;
    var ctx = cv.getContext("2d"), W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var color = dark ? "95,191,156" : "30,107,88", gold = dark ? "224,178,90" : "212,160,60";
    var items = [], mx = 0, my = 0, visible = true, raf = 0;
    function size() { var r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function make() {
      items = [];
      var n = Math.round(Math.min(28, Math.max(12, W / 50)));
      for (var i = 0; i < n; i++) items.push({ x: Math.random() * W, y: Math.random() * H, z: .35 + Math.random() * .9, r: 18 + Math.random() * 34, a: Math.random() * Math.PI, va: (Math.random() - .5) * .004, vx: (Math.random() - .5) * .12, vy: (Math.random() - .5) * .08, tilt: Math.random() * Math.PI, vt: (Math.random() - .5) * .006, gold: i % 6 === 0 });
    }
    function star(x, y, r, rot, squash) {
      ctx.beginPath();
      for (var k = 0; k < 16; k++) { var ang = rot + k * Math.PI / 8, rad = k % 2 === 0 ? r : r * .765; var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad * squash; k ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py); }
      ctx.closePath();
    }
    function frame() {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < items.length; i++) {
        var s = items[i];
        s.a += s.va; s.tilt += s.vt; s.x += s.vx * s.z; s.y += s.vy * s.z;
        if (s.x < -60) s.x = W + 60; if (s.x > W + 60) s.x = -60; if (s.y < -60) s.y = H + 60; if (s.y > H + 60) s.y = -60;
        var px = s.x + mx * 40 * s.z, py = s.y + my * 24 * s.z, squash = .35 + Math.abs(Math.cos(s.tilt)) * .65;
        ctx.fillStyle = "rgba(" + (s.gold ? gold : color) + "," + (dark ? .10 : .07) * s.z + ")";
        star(px, py, s.r * s.z, s.a, squash); ctx.fill();
        ctx.strokeStyle = "rgba(" + (s.gold ? gold : color) + "," + (dark ? .28 : .18) * s.z + ")"; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    size(); make(); frame();
    window.addEventListener("resize", function () { size(); make(); });
    window.addEventListener("pointermove", function (e) { mx = e.clientX / window.innerWidth - .5; my = e.clientY / window.innerHeight - .5; }, { passive: true });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(cv);
    document.addEventListener("visibilitychange", function () { visible = !document.hidden; });
  })();

  /* ---------- Motion (GSAP + ScrollTrigger, loaded deferred; everything degrades to a static page) ---------- */
  (function motion() {
    if (reduce || !window.gsap) return;
    var isRtl = J.dir === "rtl", dirX = isRtl ? -1 : 1;
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    // Hero: split the headline into words so they rise one by one
    var h1 = document.querySelector("h1");
    if (h1 && !h1.querySelector(".w")) {
      var words = h1.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
      words.forEach(function (w) { if (!w) return; if (/^\s+$/.test(w)) return frag.appendChild(document.createTextNode(w)); var s = document.createElement("span"); s.className = "w"; s.style.display = "inline-block"; s.textContent = w; frag.appendChild(s); });
      h1.textContent = ""; h1.appendChild(frag);
    }
    var stage = document.querySelector("[data-demo]");
    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from("h1 .w", { y: 34, rotationX: -35, opacity: 0, duration: .8, stagger: .05, transformOrigin: "50% 100%" })
      .from(".hero .lede, .demo-page .lede", { y: 18, opacity: 0, duration: .6 }, "-=.4")
      .from(".hero .ctas .btn, .hero .tags li", { y: 14, opacity: 0, duration: .5, stagger: .06 }, "-=.35");
    if (stage) tl.from(stage, { rotationY: 30 * dirX, x: 70 * dirX, opacity: 0, duration: 1.1, ease: "power4.out" }, .15);

    // Pointer tilt on the display, smoothed with quickTo, plus a slow idle float
    document.querySelectorAll("[data-demo] [data-display]").forEach(function (disp) {
      var host = disp.closest("section") || disp.parentNode;
      var rx = gsap.quickTo(disp, "rotationX", { duration: .6, ease: "power3" }), ry = gsap.quickTo(disp, "rotationY", { duration: .6, ease: "power3" });
      host.addEventListener("pointermove", function (e) { var r = host.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - .5) * 8); rx(-((e.clientY - r.top) / r.height - .5) * 8); }, { passive: true });
      host.addEventListener("pointerleave", function () { rx(0); ry(0); });
      gsap.to(disp, { y: -6, duration: 3.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
    });

    // Scroll reveals: elements stay fully visible until their block enters the viewport, then animate in.
    // IntersectionObserver is used instead of ScrollTrigger so a jump past a tall block can never strand it hidden.
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        (en.target._reveals || []).forEach(function (r) { gsap.from(r.targets, r.vars); });
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.01 });
    function reveal(trigger, targets, vars) {
      var trig = typeof trigger === "string" ? document.querySelector(trigger) : trigger;
      if (!trig) return;
      var list = typeof targets === "string" ? trig.querySelectorAll(targets) : targets;
      if (!list || !list.length) return;
      (trig._reveals = trig._reveals || []).push({ targets: list, vars: Object.assign({ ease: "power3.out" }, vars) });
      io.observe(trig);
    }

    gsap.utils.toArray("main > section:not(.hero)").forEach(function (sec) { reveal(sec, ".eyebrow, h2, .lede-sm, .teaser-row p", { y: 24, opacity: 0, duration: .7, stagger: .1 }); });
    gsap.utils.toArray(".timeline").forEach(function (list) { reveal(list, "li", { rotationX: -30, y: 26, opacity: 0, duration: .8, stagger: .1, transformOrigin: "top" }); });
    reveal(".flows", ".flow", { y: 30, rotationY: 12 * dirX, opacity: 0, duration: .9, stagger: .15, transformOrigin: isRtl ? "right center" : "left center" });
    reveal(".cols3", ":scope > div", { y: 24, opacity: 0, duration: .7, stagger: .1 });
    reveal(".diagram", ".node", { scale: .85, opacity: 0, duration: .6, stagger: .07, ease: "back.out(1.6)" });
    reveal(".langdemo", document.querySelectorAll(".langdemo"), { y: 30, opacity: 0, duration: .8 });
    reveal(".phone-grid", ".phone-mock", { y: 50, rotationY: -18 * dirX, opacity: 0, duration: 1 });
    reveal(".phone-grid", ".flow-steps.vertical li, .noapp, .qr", { x: 24 * dirX, opacity: 0, duration: .6, stagger: .08 });
    reveal(".free", ".free-line, .why", { y: 18, opacity: 0, duration: .6, stagger: .12 });
    reveal(".hadith", ".hadith-ar, .hadith-tr, .hadith-src", { y: 20, opacity: 0, duration: .9, stagger: .15, ease: "power2.out" });
    reveal(".faq-list", "details", { y: 16, opacity: 0, duration: .5, stagger: .08 });
    reveal(".reliability", ".chips li, .repo-row a", { y: 12, opacity: 0, duration: .45, stagger: .05, ease: "power2.out" });
    reveal(".cta", ".contact", { y: 40, rotationX: 12, opacity: 0, duration: .9, transformOrigin: "top" });
    reveal(".cta", "h2, .btn-get, .cta-sub", { y: 24, opacity: 0, duration: .7, stagger: .1 });
  })();
})();
