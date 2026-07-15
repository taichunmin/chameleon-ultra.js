# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`chameleon-ultra.js` is a JavaScript/TypeScript SDK for talking to the [ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra) RFID/NFC device over Web Bluetooth, Web Serial, or Node.js SerialPort. It implements the device's binary command protocol (frame parsing, LRC checksums, command/response matching) plus higher-level helpers for MIFARE Classic, MIFARE Ultralight, HID Prox, and LF EM410x operations.

## Commands

Package manager is **yarn** (yarn.lock is authoritative).

```bash
yarn                       # install deps
yarn test                  # run vitest (watch mode), 180s test timeout
yarn test:ci               # run vitest once with coverage (--run --coverage)
yarn lint:ci                # eslint check only
yarn lint                   # eslint --fix
yarn build                  # full build: js bundles, cjs interop, docs, pug pages, sitemap
yarn build:js                # tsup only (fastest way to check the library still bundles)
yarn dev                     # watch mode for docs+pug+js+https dev server together
```

Run a single test file: `yarn vitest run src/Crypto1.test.ts`
Run a single test by name: `yarn vitest run src/ChameleonUltra.test.ts -t "cmdBleGetAddress"`

CI (`.github/workflows/ci.yml`) runs `yarn lint`, `yarn test:ci`, `yarn build`, `yarn publish:test` on every push/PR, then deploys docs to GitHub Pages and publishes to npm on `master`.

## Repository rules

Detailed guidance for each topic lives in `.claude/rules/` — most are path-scoped and auto-load when working with matching files (see each file's `paths` frontmatter); `usage-rules.md` has no `paths` and loads every session, like this file:

- **[.claude/rules/usage-rules.md](.claude/rules/usage-rules.md)** — general SDK usage guidance: adapter registration/lifecycle, `Buffer` usage, connect/disconnect, DFU reconnect gotchas, BLE pairing, troubleshooting tips.
- **[.claude/rules/sdk-architecture.md](.claude/rules/sdk-architecture.md)** (`src/**/*`) — the `ChameleonUltra` class: transport-agnostic core, plugin/hook system, frame protocols, supporting modules (`enums.ts`, `types.ts`, `decoder.ts`, `helper.ts`, `Crypto1.ts`, etc.).
- **[.claude/rules/adapters.md](.claude/rules/adapters.md)** (`src/plugin/**/*`) — transport adapters (`WebbleAdapter`, `WebserialAdapter`, `SerialPortAdapter`) and other plugins (`Debug`, `DfuZip`); `BufferMockAdapter` is a test-only adapter (not published as a standalone `chameleon-ultra.js/plugin/*` entry point).
- **[.claude/rules/unit-test.md](.claude/rules/unit-test.md)** (`src/**/*.test.ts`) — test-writing conventions (`vitest`, `BufferMockAdapter` usage, timeout tips).
- **[.claude/rules/typedoc.md](.claude/rules/typedoc.md)** (`**/*.ts`) — TSDoc tag conventions (`@group`, `@internal`, `@hidden`, `@inline @expand`, etc.) that drive the generated docs site.
- **[.claude/rules/static-assets.md](.claude/rules/static-assets.md)** (`public/**/*`) — static assets shipped as-is in the published bundle (kept out of `public/` itself since that folder's contents get copied verbatim into `dist/`).
- **[.claude/rules/demo-pages.md](.claude/rules/demo-pages.md)** (`pug/**/*`) — standalone browser demo pages.
- **[.claude/rules/build-utils.md](.claude/rules/build-utils.md)** (`build-utils/**/*`) — one-off Node scripts that post-process build output (cjs interop, docs version patch, sitemap/og-image/Context7 injection, local HTTPS dev server).

### Other user interfaces

Besides this SDK, the device ecosystem has other clients: the firmware itself, an official Python CLI, official protocol/user docs, and a third-party Flutter GUI. Their rules load on the same paths as the ones above (`src/**/*.ts`, `pug/**/*`, `documents/**/*.md`) and cross-link each other, so **when implementing a SDK feature or a `pug/` demo page feature, compare against all of them, not just one** — each captures a different angle (wire protocol, CLI workflow, user-facing UX, written docs) and can surface something the others miss:

- **[.claude/rules/firmware.md](.claude/rules/firmware.md)** — the [RfidResearchGroup/ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra) firmware dependency: where command IDs, payload behavior, and status codes are authoritatively defined, and known-stale doc links.
- **[.claude/rules/chameleon-cli.md](.claude/rules/chameleon-cli.md)** — the firmware repo's official Python CLI (`software/script/`), a first-party reference implementation.
- **[.claude/rules/chameleon-docs.md](.claude/rules/chameleon-docs.md)** — [RfidResearchGroup/ChameleonUltraDocs](https://github.com/RfidResearchGroup/ChameleonUltraDocs), the authoritative protocol/user docs behind the device's wiki; check its `protocol.md` before writing/updating a `cmdXxx()` doc comment and link back to it.
- **[.claude/rules/chameleon-gui.md](.claude/rules/chameleon-gui.md)** — [GameTec-live/ChameleonUltraGUI](https://github.com/GameTec-live/ChameleonUltraGUI), a third-party Flutter GUI app; a competitive-analysis reference for UX/workflow.

## Plan backups

Whenever you generate a plan (e.g. via plan mode), also write a copy to `.claude/plan/**/*.md`, organized by topic/source. For example, a plan for GitHub issue #1 goes in `.claude/plan/github-issue/1.md`.

## Docs/build pipeline

- `typedoc` + `typedoc-plugin-markdown`/`typedoc-plugin-llms-txt` generate API reference docs and `llms.txt` from TSDoc comments (see [.claude/rules/typedoc.md](.claude/rules/typedoc.md) for tag conventions).
- `dist/` is generated build output published to npm and GitHub Pages — don't hand-edit it; it's regenerated by `yarn build`.
- Multiple package entry points are defined in `package.json#exports` and built by `tsup.config.ts`.

## Lint notes

ESLint config extends `eslint-config-love` (strict TS rules) with several rules relaxed (see `.eslintrc.cjs`): `no-unsafe-argument`, `strict-boolean-expressions`, `return-await`, `unbound-method` are off. TSDoc syntax lint is a warning, not an error. `.pug` files are also linted.
