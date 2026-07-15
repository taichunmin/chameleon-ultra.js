---
paths:
  - "pug/**/*"
---

# Browser demo pages

## What this is

Standalone, no-bundler browser demo pages that exercise the SDK end-to-end against a real ChameleonUltra device (documented in `documents/demos.md`, linked from the main README's Demo button). Each `pug/src/*.pug` compiles to one HTML file at the same relative path under `dist/` (e.g. `pug/src/mfkey32.pug` → `dist/mfkey32.html`), served from GitHub Pages alongside the library's own typedoc output.

These pages are not part of the TypeScript build — they're plain Vue 2 + Bootstrap 4 apps that load the already-built SDK via `<script>` tags, for manual/browser testing of adapters (`WebbleAdapter`/`WebserialAdapter`) and device commands that can't be exercised by `vitest` (real BLE/USB, real tag hardware).

## Commands (run from repo root)

```bash
yarn build:pug                # tsx ./pug/build.ts — renders all pug/src/**/*.pug into dist/
yarn dev:pug                    # nodemon --watch pug --ext pug --exec "yarn build:pug"
yarn dev:https                  # serves dist/ over HTTPS with livereload (requires yarn mkcert once)
yarn dev                        # runs dev:docs + dev:https + dev:pug + dev:js together
```

`dev:https` needs local certs first: `yarn mkcert` (writes `./mkcert/{cert,key}.pem`, used by `build-utils/https.ts`).

There's no dedicated lint script for this folder — `pug/.eslintrc.cjs` is picked up automatically by the root `yarn lint`/`yarn lint:ci` (which runs `eslint --ext .mjs,.js,.js,.ts,.pug .`), and it also lints the inline `script.` blocks inside `.pug` files via `eslint-plugin-pug`.

## Build pipeline (`pug/build.ts`)

- Globs `pug/src/**/*.pug` and renders each with `pug.renderFile`, passing `PUG_OPTIONS = { basedir, baseurl, NODE_ENV }` as template locals.
  - `baseurl` (from `pug/dotenv.ts#getSiteurl()`, default `https://taichunmin.idv.tw/chameleon-ultra.js/`, overridable via `.env` `BASEURL`) is used everywhere a page needs an absolute/site-relative asset URL — the site is deployed under a GitHub Pages subpath, so **never hardcode `/`-rooted asset paths in a page; always prefix with `baseurl`** (see script tags in `pug/include/bootstrapV4.pug`).
  - `NODE_ENV` (default `production`) — when not `production`, `html-minifier` is skipped and `pug/include/livereload.pug` injects the livereload client script.
- In production mode, output HTML is run through `html-minifier` (with inline JS minified via `uglify-js` and inline CSS minified).
- Output path mirrors the source path 1:1 under `dist/` with `.pug` → `.html`; adding a new page under `pug/src/` is picked up automatically by the glob — no manual registration needed for the build itself. (It still won't appear in `documents/demos.md`, the nav, or the CI jsDelivr purge list in `.github/workflows/ci.yml` unless added there.)
- A render failure in one file is logged (with `errToJson` from `pug/utils.ts` for readable error dumps) and counted; the build throws only after attempting all files, failing CI if any page has an error.

## Shared layout: `pug/include/bootstrapV4.pug`

Every page does `extends /include/bootstrapV4` and fills in these blocks:

- `beforehtml` — set `title` (required) and optionally reassign the top-level `ogImage`/`ogImageWidth`/`ogImageHeight` locals (declared before this block runs) for social-preview meta tags.
- `style` — page-specific `<meta property="og:*">` tags and a `style: :sass` block. Common page CSS conventions: `[v-cloak] { display: none }` (hide app root until Vue mounts), Noto Sans TC font stack, `.letter-spacing-n1px` utility class, `.text-sm`.
- `content` — the page body, conventionally a single `#app.container(v-cloak)` Vue root.
- `script` — page logic (see below). Loaded after all shared vendor/SDK scripts from the base layout.

The base layout itself loads, in order: Bootstrap 4/jQuery/Popper, Vue 2, axios, dayjs, lodash, papaparse, json5, qs, SweetAlert2 (`Swal`), prismjs, flexsearch, animate.css, font-awesome — then the SDK's global IIFE builds (`index.global.js`, `Crypto1.global.js`, `plugin/Debug.global.js`, `plugin/DfuZip.global.js`, `plugin/WebbleAdapter.global.js`, `plugin/WebserialAdapter.global.js`, all exposed together on `window.ChameleonUltraJS`), plus an `importmap` for pages that prefer real ESM imports (`@taichunmin/buffer`, `@taichunmin/crc/*`, `jszip`, `lodash`) instead of the globals.

## Conventions shared across demo pages

- **Dual adapter pattern**: pages that talk to a device create two `ChameleonUltra` instances up front — one with `WebserialAdapter` (USB, PC only) and one with `WebbleAdapter` (BLE, PC/Android/iPhone) — both wrapped with `Debug` for console logging, and expose a `computed.ultra` that picks between them based on a `ls.adapter` (`'usb' | 'ble'`) toggle bound to a `<select>`.
- **Persisted UI state**: reactive `ls` (localStorage) and `ss` (sessionStorage) data objects are auto-saved/restored per-page via `location.pathname` as the storage key, serialized with `JSON5`, restored on `mounted()` and persisted via a deep `$watch`. Follow this pattern for any new page state instead of inventing a new persistence mechanism.
- **`showLoading(title, text)`** via `Swal.fire(...)` + `Swal.showLoading()` is the standard way to block the UI during async device operations.
- **File import** for dump files uses a hidden `input.d-none(type="file", ref="dumpImport", @change=..., @cancel=...)` plus a `dumpImport: { cb: null }` data field used as a one-shot promise resolver — copy this pattern (see `mfkey32.pug`, `mifare-xiaomi.pug`) rather than inventing a new file-picker flow.
- UI is Bootstrap 4 utility classes + a small set of custom helpers: `.bgicon.bgicon-<name>` for SVG background icons (defined in `pug/include/bootstrapV4.pug`, backed by `public/img/*.svg`), `.letter-spacing-n1px`, `.text-sm`.
- Pages are standalone: there is no shared JS module between `pug/src/*.pug` files. Common logic (well-known keys, hex/byte helpers, etc.) is currently duplicated per page — check an existing page with a similar feature before writing new helper logic from scratch.

## Adding a new demo page

1. Add `pug/src/<name>.pug`, `extends /include/bootstrapV4`, fill in `beforehtml`/`style`/`content`/`script` blocks following an existing page of similar shape (`test.pug` for minimal, `hf14a-scanner.pug` for a simple device-interaction tool).
2. Add an entry to `documents/demos.md` if it should be discoverable from the docs site.
3. Add its `.html` path to the jsDelivr purge list in `.github/workflows/ci.yml` only if it's meant to be CDN-cached long-term (most demo pages currently are not listed there — only the library bundles are).
