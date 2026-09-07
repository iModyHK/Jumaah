# Changelog

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
