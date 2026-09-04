# Contributing to Jumaah

Jumaah is built as an ongoing charity (sadaqah jariyah) for mosques. Every contribution reaches every mosque that runs it. Thank you.

## Ways to help

- **Review translations.** If you read Urdu, Bengali, Somali, Turkish, Amharic or any other language natively, review the interface strings in `packages/shared/src/i18n/` and open a pull request with corrections.
- **Test on real hardware.** Old smart TVs, projectors, Raspberry Pi boards, cheap tablets. Open an issue with the device, browser version and what broke.
- **Report bugs.** Use the bug report template. Include the version and, for the display or imam apps, the browser.
- **Code.** See below.

## Development setup

Follow **Quick start (development)** in the README: Node 20+, pnpm 9, Docker for Postgres and Redis, then `pnpm dev`.

Before opening a pull request:

```bash
pnpm typecheck && pnpm test && pnpm build
```

Playwright end-to-end tests (`pnpm test:e2e`) are welcome but not required for small changes.

## Pull requests

- One change per pull request, with a short description of what and why.
- Keep the imam and display apps working offline; do not add network calls to the Friday path.
- Qur'an and hadith handling is deliberately conservative (`packages/shared/src/paragraphs.ts`). Changes there need a note explaining the reasoning and test cases.
- User-facing text goes through i18n (`en.json` and `ar.json`). Arabic is the primary market; keep RTL layouts working.
- Do not commit secrets, `.env` files, or provider keys.

## Design decisions

`DECISIONS.md` records why things are built the way they are. Read it before proposing architectural changes, and add to it when you make one.

## Security

Do not report vulnerabilities in public issues. See `SECURITY.md`.

## License

By contributing you agree that your contribution is licensed under the MIT License, the same license as the project.
