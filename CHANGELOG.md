# Changelog

## 1.0.3 — 2026-09-08

- API: a quota hook lets an extension cap how many screens or staff accounts a mosque creates, and how many
  languages one screen shows. It covers invitations as well as direct creation. The Community server sets no
  hook, so nothing is ever capped there.
- Admin: a navigation item may name a group, so a server operator sees their pages under their own heading;
  and an extension may replace the server-wide page outright.
- Tests: importing a khutbah from a text or PDF file is now covered end to end.

## 1.0.2 — 2026-09-07

- API: extensions can add instructions to the AI translators through the new translationInstructions hook
  (appended to the built-in prompt for Claude, OpenAI and Ollama, in translation jobs and provider tests).
- Dependencies: ioredis 6, @fastify/multipart 10 (security release), pdf-parse 2 (current pdf.js; PDF import
  joins pages itself). Newer GitHub Actions. Dependabot leaves Node, zod and the Vite React plugin majors alone.
- scripts/release.mjs cuts a release: checks the changelog entry, bumps every version, commits and tags.

## 1.0.1 — 2026-09-07

- Screens: the board between khutbahs now fits the screen whatever the mosque shows on it. On wide (16:9) screens the
  announcement sits beside the clock and the QR code beside the prayer times; if the board is still too tall it is
  scaled down instead of being clipped.
- API: the server starts only when it is the actual entry point, so an extension that imports it (Jumaah Cloud) no
  longer boots a second server on the same port. The provider factory is exported for extensions.

## 1.0.0 — 2026-09-07

First release of the Jumaah Community Edition as its own project.

- Everything a mosque needs, fully offline on its own server: khutbah preparation with automatic paragraph splitting and
  Quran/Hadith protection, translation providers (manual, Anthropic, OpenAI, Google, DeepL, LibreTranslate, Ollama)
  with glossary, cache and fallback chain, the review and approval workflow, the imam's tablet view, screens in up to
  four languages with per-language fonts, the worshippers' phone page, prayer times from the mosque's location, the
  logo on screens, the printable QR poster, the board between khutbahs, backups, audit log, bilingual admin (ar/en).
- Optional sync client for Jumaah Cloud (`docs/sync-protocol.md`); the server runs without any cloud settings.
- Extension points in the API, admin and display apps so the hosted edition can build on this code without forking it.
- MIT licence.
