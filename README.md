# Jumaah — Live Friday Khutbah Translation

[🇸🇦 النسخة العربية](README.ar.md)

> **For mosques:** [www.jumaah.net](https://www.jumaah.net) shows what Jumaah does, with a live demo, and how to get it. It is free for every mosque. This README is for the people who install or develop it. Questions: use the form on the website. Bugs: [open an issue](https://github.com/iModyHK/Jumaah/issues).

Multi-tenant platform that shows the Friday khutbah, paragraph by paragraph, translated on the mosque's screens while the imam reads it in Arabic. Every mosque runs a small **edge server** (Docker, fully offline during the khutbah) and can optionally sync with a central **cloud server** (mosque management, shared khutbah library, central translation keys, backups).

```
┌───────────────────────── mosque LAN (edge) ──────────────────────────┐        ┌────────── cloud ──────────┐
│  Imam tablet ──► /imam/  ─┐                                          │        │  /admin/ (super admin)    │
│                           ├─ Socket.IO ─► API (Fastify) ─► Postgres  │◄─sync─►│  API · Postgres · Redis   │
│  Screens ─────► /display/ ┘               │      └─► Redis           │        │  shared library · keys    │
│  Phones (QR) ─► /display/m/<mosque>       └─► sync-worker ───────────┘        └───────────────────────────┘
│  Admin ───────► /admin/                     Ollama / LibreTranslate (optional, offline MT)
└──────────────────────────────────────────────────────────────────────┘
```

## Features

- **Khutbah management** — first/second khutbah + closing dua, Hijri/Gregorian dates, RTL editor with automatic paragraph splitting (blank lines) and manual split/merge, DOCX/TXT/PDF import, full versioning + restore, copy previous khutbah, shared library across mosques (super-admin approval), Quran/Hadith blocks detected and never machine-translated.
- **Translation engine** — pluggable `TranslationProvider` interface with Manual, Anthropic Claude, OpenAI, Google Cloud Translation, DeepL, LibreTranslate and Ollama (local) implementations, per-mosque glossary (keep / replace / hint), orderable fallback chain, cache for identical paragraphs, cost estimate before running, batch jobs with live progress, machine → review → approve workflow (only approved text is ever shown on screens).
- **Imam view (PWA)** — big adjustable Arabic text, dark mode, current/next/previous paragraph, huge Next/Previous/Pause/Improv/section buttons, swipe & keyboard, timers and progress, wake lock, offline command queue with automatic reconnection, optional auto-advance, single active imam session per mosque with take-over.
- **Displays (PWA)** — token URL per screen (no login), 1–4 languages in single/split/grid layouts, per-language fonts and direction (Urdu Nastaliq, Bengali, Amharic, Chinese…), previous paragraph faded, waiting screen with mosque name, prayer times, welcome message and a QR code that opens the same translation on a worshipper's phone, kiosk/fullscreen, "imam is speaking" during improvisation.
- **Realtime** — Socket.IO over the LAN (< 200 ms), authoritative state on the server, late-joining screens get the current paragraph immediately, sequence numbers, heartbeat and reconnection.
- **Multi-tenant + hybrid hosting** — `tenantId` on every table + PostgreSQL RLS policies, Docker Compose for edge and cloud, outbox-based two-way sync with last-write-wins (losing versions kept), edge relays translation to the cloud when online and uses local models offline, edge update via image tag published by the cloud.
- **Security & ops** — email/password login with invitations, JWT access + rotating refresh tokens, Redis rate limiting, AES-256-GCM encrypted API keys, audit log with before/after, backup/restore from the admin UI, bilingual (Arabic RTL / English) admin.

## Repository layout

```
apps/
  api/            Fastify REST + Socket.IO server (+ translation job runner)
  admin/          React admin dashboard (ar/en)
  imam/           Imam PWA
  display/        Screens + public mobile PWA
  sync-worker/    Edge ↔ cloud outbox synchroniser
packages/
  shared/         Types, zod schemas, paragraph splitter, socket events, i18n resources
  translation-providers/  Provider interface, implementations, glossary, cache keys, cost, fallback chain
  db/             Prisma schema, migrations (incl. RLS), seed, crypto helpers, sync apply logic
  ui/             Shared React bits: i18n bootstrap, API client, socket client, hooks, fonts, theme
tests/e2e/        Playwright end-to-end (upload → translate → approve → broadcast → display)
infra/            Caddy config, web Dockerfile, install/update scripts
docker-compose.edge.yml · docker-compose.cloud.yml · .env.example · DECISIONS.md
```

## Quick start (development)

Requirements: Node 20+, pnpm 9, Docker.

```bash
pnpm install
cp .env.example .env                      # defaults work for local dev
docker run -d --name jumaah-dev-pg -e POSTGRES_USER=jumaah -e POSTGRES_PASSWORD=jumaah_dev_password -e POSTGRES_DB=jumaah -p 5432:5432 postgres:16-alpine
docker run -d --name jumaah-dev-redis -p 6379:6379 redis:7-alpine
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                                  # api :4000, admin :5173, imam :5174, display :5175
```

Seeded accounts (change them in production):

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `admin@jumaah.app` | `Admin12345!` |
| Mosque admin (demo) | `admin@demo.mosque` | `Demo12345!` |
| Translator | `translator@demo.mosque` | `Demo12345!` |
| Imam | `imam@demo.mosque` | `Demo12345!` |

Demo screens: `http://localhost:5175/display/demo-main-display-token-0001` (en + ur, split) and `…/display/demo-hall-display-token-0002` (en + ur + bn, grid). Public phone page: `http://localhost:5175/display/m/demo`.

### Tests

```bash
pnpm test            # unit tests (paragraph splitter, hijri, glossary, chain, all providers mocked) + API integration tests (needs Postgres/Redis)
pnpm test:e2e        # Playwright: starts api + 3 frontends, runs the full khutbah scenario (first: pnpm --filter @jumaah/e2e install-browsers)
pnpm typecheck && pnpm build
```

## Deploying on a mosque server (edge)

Any small x86/ARM box on the mosque LAN (4 GB RAM is plenty; more if you run Ollama).

```bash
curl -fsSL https://raw.githubusercontent.com/iModyHK/Jumaah/main/infra/scripts/edge-install.sh | bash
```

The script installs Docker, clones the repo to `/opt/jumaah`, writes `.env` with generated secrets, starts `docker-compose.edge.yml` and seeds the first admin (printed at the end). Manual equivalent:

```bash
cp .env.example .env    # set JWT_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD, PUBLIC_BASE_URL=http://<lan-ip>:8080
SEED_ON_START=1 docker compose -f docker-compose.edge.yml up -d --build
```

- Admin: `http://<lan-ip>:8080/admin/` · Imam: `/imam/` · Screens: `/display/<token>`.
- Offline machine translation: `docker compose -f docker-compose.edge.yml --profile local-ai up -d` then `docker compose -f docker-compose.edge.yml exec ollama ollama pull qwen2.5:7b`. Add the provider in Admin → Translation providers (Ollama, `http://ollama:11434`).
- Connect to the cloud: the super admin creates the mosque in the cloud admin (a **sync key** is shown once); on the edge set `CLOUD_API_URL`, `EDGE_TENANT_SLUG`, `EDGE_SYNC_KEY` in `.env` and restart. The sync worker bootstraps the mosque data if the local DB is empty, then syncs every `SYNC_INTERVAL_SECONDS` (or on "Sync now").
- Update: `./infra/scripts/edge-update.sh` pulls the tag announced by the cloud (`edge.latestImageTag`, editable in the super-admin Platform page) and restarts.
- Backups: Admin → Backups (JSON.gz per mosque, download/restore/upload). Volumes: `pgdata`, `redisdata`, `backups`.

## Deploying the cloud

```bash
cp .env.example .env    # DEPLOYMENT_MODE=cloud, strong secrets, SITE_ADDRESS=jumaah.example.com, ANTHROPIC_API_KEY=… (central keys)
SEED_ON_START=1 docker compose -f docker-compose.cloud.yml up -d --build
```

Caddy obtains TLS automatically for `SITE_ADDRESS`. Central provider keys from `.env` are turned into global providers at first start (and can be managed in Admin → Providers → platform section). Nightly `pg_dump` in the `db-backup` service.

## Setting up screens

1. Admin → Displays → Add: name, languages (1–4), layout (single / split / grid), font scale, theme, previous-paragraph, Arabic strip, QR.
2. Open the display URL on the screen device (any Chromium/Firefox/Smart-TV browser, Raspberry Pi in kiosk mode works well). Tap once to go fullscreen; the page keeps the screen awake and reconnects automatically.
3. Regenerate the token from the admin if a URL leaks. Changing layout/languages in the admin updates the screen live.
4. The waiting screen shows a QR to `/display/m/<mosque-slug>`; worshippers pick their language on their phone. Disable with `publicDisplayEnabled=false` in Settings.

Kiosk hint (Raspberry Pi OS): `chromium-browser --kiosk --noerrdialogs --disable-session-crashed-bubble http://<lan-ip>:8080/display/<token>`.

## Adding a translation provider

1. Add the type to `PROVIDER_TYPES` in `packages/shared/src/constants.ts` and to the `ProviderType` enum in `packages/db/prisma/schema.prisma` (`pnpm db:migrate:dev --name add_provider`).
2. Implement `TranslationProvider` in `packages/translation-providers/src/providers/<name>.ts` (see `google.ts` for a placeholder-protected MT engine or `anthropic.ts` for an LLM using `buildSystemPrompt`). Throw `ProviderError` with the right code (`AUTH`, `RATE_LIMITED` retryable, `UNSUPPORTED_LANG`…) so the fallback chain behaves.
3. Register it in `packages/translation-providers/src/registry.ts` (`factories` + `PROVIDER_META`) and add a unit test with a mocked `fetch` in `chain.test.ts`.
4. Add the display name to `providers.types.*` in `packages/shared/src/i18n/{ar,en}.json`. The admin UI picks it up automatically.

## Environment

All variables are documented in [`.env.example`](.env.example). Design choices and trade-offs are in [`DECISIONS.md`](DECISIONS.md).

## Contributing and security

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to help (translations, device testing, code) and [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities privately.

## License

[MIT](LICENSE). Free for every mosque, forever.
