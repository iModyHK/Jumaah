# Jumaah.net

Static site generated from content files, plus a tiny form handler. Lives in `website/` inside the Jumaah repo. Arabic is the default: `/`, `/demo`, `/install`. English is at `/en/`, `/en/demo`, `/en/install`. Old `/ar` URLs redirect.

Fonts are self-hosted (`assets/fonts`, fetched once with `node tools/fetch-fonts.mjs`, all SIL OFL). Only the heading face is inlined; the rest load from a per-language stylesheet after parsing, which keeps first paint fast on slow phones. No request leaves the site except GSAP from cdnjs and the Turnstile widget.

CI: `.github/workflows/website.yml` builds the site, builds and smoke-tests the image, scans it with Trivy, and on a `v*` tag pushes `malkurbi5/jumaah-site:latest` and `:<version>` to Docker Hub (needs the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets). Dependabot watches npm, Docker base images and Actions weekly.

```
src/content/en.mjs     English copy
src/content/ar.mjs     Arabic copy
src/content/demo.mjs   Sample khutbah used by every demo (Arabic + en/ur/bn/so)
src/render.mjs         HTML templates (landing + demo)
src/assets/            site.css, site.js (no dependencies)
assets/                logo, favicon, QR code
build.mjs              writes dist/
server.mjs             serves dist/ and POST /api/contact (self-hosting)
functions/api/         same handler for Cloudflare Pages
shared/submit.mjs      form logic shared by both
```

## Build

```bash
node build.mjs
```

Environment variables read at build time: `SITE_URL` (default `https://www.jumaah.net`), `TURNSTILE_SITE_KEY` (default: the current widget), `SOCIAL_PROOF=1` to render the social-proof section. That section only renders when real data is filled into `social` in `build.mjs`; never put estimates there.

## Run locally

Create `.dev.vars`-style env in your shell, then:

```bash
node build.mjs && TURNSTILE_SECRET_KEY=... RESEND_API_KEY=... node server.mjs
```

Open http://localhost:8080. Turnstile test keys (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`) always pass if you want to test without the real widget.

## Deploy on the NAS (Docker + Portainer + Nginx Proxy Manager)

1. Build and push from your PC:

   ```bash
   docker build -t malkurbi5/jumaah-site:latest . && docker push malkurbi5/jumaah-site:latest
   ```

2. Portainer → Stacks → Add stack `jumaah-site`, paste `docker-compose.yml`, add `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY` as stack environment variables, deploy. Listens on NAS port 8787.
3. Nginx Proxy Manager → Proxy Host for `www.jumaah.net` → NAS IP, port 8787, Let's Encrypt, force SSL. Add a second host for the bare `jumaah.net` that redirects (301) to `https://www.jumaah.net`, so links without www still work and search engines see one site.
4. Cloudflare → Turnstile → widget hostnames: add `www.jumaah.net`.
5. Submit the contact form once and check malkurbi5@gmail.com. `docker logs jumaah-site` shows Turnstile or Resend errors.

Update later: rebuild, push, then *Pull and redeploy* the stack in Portainer.

## Deploy on Cloudflare Pages (alternative)

Build command `node build.mjs`, output directory `dist`. Functions are picked up from `functions/`. Set `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY` as encrypted variables; bind a KV namespace as `RATE_LIMIT` for the per-IP limit.

## Security headers

`shared/headers.mjs` defines the Content-Security-Policy and the other headers (HSTS, nosniff, frame options, referrer and permissions policies). The Node server sends them on every response; the build writes the same set into `dist/_headers` for Cloudflare Pages. No inline script executes on the site: page data is a JSON block and structured data is `ld+json`. `/.well-known/security.txt` (RFC 9116) is generated at build time with a one-year expiry, so rebuild at least yearly. `robots.txt` allows everything except `/api/`. `404.html` is bilingual.

## Contact form protection

Turnstile verified server-side, honeypot field, minimum fill time of four seconds, same-origin check, input limits, and an optional per-IP rate limit. The email goes to `TO_EMAIL` (default malkurbi5@gmail.com) from `FROM_EMAIL` (default `onboarding@resend.dev`, which Resend only delivers to the account owner until a domain is verified).

## Honesty rules baked into the copy

- No time promises ("ready in 10 minutes" was removed).
- The only latency number on the site is measured live in the visitor's browser.
- Qur'an: detection markers and the reviewer-entered published translation are described exactly as implemented in the Jumaah codebase (`packages/shared/src/paragraphs.ts`, `includeSpecialBlocks` default false, displays render only `APPROVED` translations).
- The GitHub link and version badge read the version from `../Jumaah/package.json` at build time, or from the `APP_VERSION` build arg in Docker. Bump `FALLBACK_VERSION` in `build.mjs` when neither is available.
- Social proof stays hidden until real numbers exist.
