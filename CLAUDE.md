# CLAUDE.md

`chameleon-ultra.js` is a JS/TS SDK for the [ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra) RFID/NFC device over Web Bluetooth, Web Serial, or Node.js SerialPort: the binary command protocol plus MIFARE Classic/Ultralight, HID Prox and EM410x helpers.

## Commands

Use **yarn**.

```bash
yarn test       # vitest watch, 180s timeout
yarn test:ci    # vitest once + coverage
yarn lint       # eslint --fix (lint:ci = check only)
yarn build      # js + docs + pug + sitemap
yarn build:js   # tsdown only, fastest bundle check
yarn dev        # watch everything + https dev server
```

Single test: `yarn vitest run src/ChameleonUltra.test.ts -t "cmdBleGetAddress"` (no 180s timeout this way).

CI (`.github/workflows/ci.yml`) runs lint, test:ci, build, packed-tarball checks; on `master` it also deploys docs and publishes to npm.

## Rules

Topic rules in `.claude/rules/` auto-load by path; `usage-rules.md` always loads.

- [usage-rules.md](.claude/rules/usage-rules.md) — SDK usage, adapters, `Buffer`, DFU, BLE pairing
- [sdk-architecture.md](.claude/rules/sdk-architecture.md) (`src/`) — `ChameleonUltra` core, plugins, frame protocols
- [adapters.md](.claude/rules/adapters.md) (`src/plugin/`) — transport adapters, `Debug`, `DfuZip`, `BufferMockAdapter`
- [unit-test.md](.claude/rules/unit-test.md) (`*.test.ts`) — test conventions
- [typedoc.md](.claude/rules/typedoc.md) (`*.ts`) — TSDoc tags
- [static-assets.md](.claude/rules/static-assets.md) (`public/`) — shipped static assets
- [demo-pages.md](.claude/rules/demo-pages.md) (`pug/`) — browser demo pages
- [build-utils.md](.claude/rules/build-utils.md) (`build-utils/`) — build post-processing scripts

When implementing an SDK or demo-page feature, cross-check **all** of these external references:

- [firmware.md](.claude/rules/firmware.md) — firmware: authoritative cmd IDs, payloads, status codes
- [chameleon-cli.md](.claude/rules/chameleon-cli.md) — official Python CLI
- [chameleon-docs.md](.claude/rules/chameleon-docs.md) — ChameleonUltraDocs `protocol.md`
- [chameleon-gui.md](.claude/rules/chameleon-gui.md) — third-party Flutter GUI, UX reference

## Conventions

- Plans: also save a copy under `.claude/plan/<topic>/` (e.g. `.claude/plan/github-issue/1.md`).
- Domain glossary: [.claude/CONTEXT.md](.claude/CONTEXT.md), ADRs also under `.claude/` — never the repo root (typedoc picks it up). Use it wherever a skill says root `CONTEXT.md`.
- `dist/` is build output; never hand-edit.
- Entry points: `package.json#exports`, built by `tsdown.config.mts`.
- ESLint: `eslint-config-love` with some rules relaxed (`eslint.config.mjs`); TSDoc syntax is warn-only; `.pug` is linted too.
