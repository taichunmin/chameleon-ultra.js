---
paths:
  - "pug/**/*"
---

# Browser demo pages

Standalone, no-bundler browser demo pages that exercise the SDK end-to-end against a real ChameleonUltra device (documented in `documents/demos.md`, linked from the main README's Demo button). Each `pug/src/*.pug` compiles to one HTML file under `dist/` (e.g. `pug/src/mfkey32.pug` → `dist/mfkey32.html`), served from GitHub Pages alongside the typedoc output. Vue 3 + Bootstrap 5, loaded via native ESM `<script type="module">` — no bundler, no jQuery, no Font Awesome.

## Commands

```bash
yarn build:pug   # tsx ./pug/build.ts — renders all pug/src/**/*.pug into dist/
yarn dev:pug     # nodemon --watch pug --ext pug --exec "yarn build:pug && yarn build:sitemap"
yarn dev:https   # serves dist/ over HTTPS with livereload (requires yarn mkcert once)
yarn dev         # dev:docs + dev:https + dev:pug + dev:js together
```

Linted by the root `yarn lint`/`yarn lint:ci` (`pug/.eslintrc.cjs`, picked up via `eslint --ext .pug`, also lints inline `script.` blocks via `eslint-plugin-pug`). **After editing a page, run `yarn build:pug` then `yarn lint:ci`** — lint catches real bugs here (undefined identifiers, a `let` that should be `const`), not just style; neither catches a broken Vue expression, so also check the rendered `dist/*.html` by hand.

## Build pipeline (`pug/build.ts`)

Globs `pug/src/**/*.pug`, renders each with `pug.renderFile(file, { basedir, baseurl, NODE_ENV, site })`. `baseurl` (from `pug/dotenv.ts#getSiteurl()`, `.env` `BASEURL`) prefixes every asset URL since the site is under a GitHub Pages subpath — never hardcode `/`-rooted paths. `site` (`{name, description, version}` from `package.json` + `gtagId` from `typedoc.json`'s `gaID`) feeds the layout's default `<title>`/`og:description`/Google Analytics tag. In production, output runs through `html-minifier`; its `minifyJS` only touches classic `<script>` tags, so `script(type="module")` blocks (all page logic) pass through untouched regardless of ES6+ syntax. Output mirrors `pug/src/` 1:1 under `dist/`; a new page needs no registration for the build itself, but won't show up in `documents/demos.md`, nav, or the CI jsDelivr purge list without adding it there.

## Shared layout: `pug/include/bootstrap5.pug`

Every page `extends /include/bootstrap5` and fills:

- `beforehtml` — reassign `title`/`description`/`ogImage`/`ogImageWidth`/`ogImageHeight`/`ogUrl`; the layout renders all `<meta property="og:*">`/`<link rel="canonical">` from these. `ogUrl` defaults to `baseurl` if left unset, but reassign it per page for a correct canonical URL (e.g. `` ogUrl = `${baseurl}mfkey32.html` ``). Don't hand-write OG meta tags in a page's own `style` block.
- `style` — page CSS. Always include `[v-cloak] { display: none }` (every page sets this itself). Reuse the layout's utility classes below instead of redeclaring them.
- `content` — `#app > .container.font-monospace.p-3.pb-5(v-cloak) > header.text-center.mb-3 > h4.icon-link(...)`, then `include /include/bootstrap5-adapter-content`, then one `.card.shadow.mb-2` per feature section. Modals go as siblings of `.container`, still inside `#app` (Vue 3 allows multiple root children).
- `script` — one `script(type="module").` block (Composition API, see below).

Loads: Bootstrap 5 CSS/JS, Google Fonts, animate.css, prismjs theme, then classic `<script>`s (dayjs, prismjs, SweetAlert2, axios, flexsearch, qs — UMD globals, e.g. `const { FlexSearch } = window`), then an ESM `importmap` (`chameleon-ultra.js` + each `chameleon-ultra.js/plugin/*`, `vue`, `bootstrap`, `sweetalert2`, `zod`, `lodash`/`lodash-es`, `json5`, `dayjs`, `jszip`, `@taichunmin/buffer`, `@taichunmin/crc/*`, `papaparse`, and `@app/` → `baseurl` for the shared utils below).

Shared utility classes: `.fs-<Npx>` (1–40px) and `.fs-1em`/`.fs-1dot2em`/`.fs-1dot5em`, `.ls-n2px`/`.ls-n1px`/`.ls-1px` (letter-spacing), `.m-n1`–`.m-n5` + directional (negative margins), `.svgmask` (icon convention below), `.svgmask-chameleon-ultra`/`.svgmask-nfc` (image icons, `public/img/*.svg`).

## Shared partial & utils

`include /include/bootstrap5-adapter-content` renders the BLE/USB `<select>` + "?" tips button, bound to `ls.adapter`/`btnAdapterTips` — every device-talking page must return both from `setup()`. Pages with no device interaction (e.g. `mifare1k-acls.pug`, an offline calculator) omit it.

`public/js/bootstrap5-utils.mjs` (imported via `@app/js/bootstrap5-utils.mjs`, a real shipped static asset — see `.claude/rules/static-assets.md`) exports: `showLoading(opts)` (block UI during async ops), `swalFire(args)` (`Swal.fire` + Discord footer), `swalConfirm(text, yes, cancel)` (Yes/Cancel dialog, use before destructive actions), `btnAdapterTips()`, `loadPageStorage`/`savePageStorage(storage, obj)` (persisted UI state pair), `enumToOptions(enumObj)`, `getJson`/`getCsv(url, cachetime)`, `btnCopy(text, container)` (`execCommand`-based, no feedback — **distinct from** the Clipboard-API+toast `btnCopy` some pages define locally), `parseJson5OrDefault`, `sleep`. Check here before writing near-identical page logic.

## Composition API conventions

`setup()` returns `{ ls, ss, ultra, btnAdapterTips, ...everything the template references }`; two `ChameleonUltra` instances (`ultraUsb`/`ultraBle`, each `.use(new Debug())` + its adapter) at module scope, picked via `computed(() => ls.adapter === 'usb' ? ultraUsb : ultraBle)`. `ls`/`ss` are `reactive()`, loaded via `loadPageStorage`, saved via a deep `watch` + `savePageStorage`. Exception: a `Buffer`-shaped field (e.g. a MIFARE dump) can't round-trip through `JSON5` — `mfkey32.pug`/`mifare-xiaomi.pug` hand-roll base64url encode/decode for that one field instead.

**Everything the Pug template references must be in `setup()`'s return** — the compiled render function only sees that plus a small allowlist, not the module's own `import`/`const` bindings. A module-level enum/lookup-table used in the template (`v-for="(v, k) in tagTypeOptions"`) needs re-exposing even though the script can use it freely. **Never use `lodash` in a template expression** (`v-for="i of _.range(8)"`) — Vue's render-proxy refuses any property named `_` outright (reserved for internals), so this fails even if returned; use Vue's numeric `v-for="n in 8"` (1-based) instead. Sanity-check a page with `awk '/^block content/{flag=1} /^block script/{flag=0} flag' pug/src/<page>.pug | grep -E '_\.|Buffer\.|ChameleonUltra\.'` — should be empty.

Modals use the `bootstrap` package's `Modal` class (`import { Modal } from 'bootstrap'`) — `useTemplateRef('x')` (pairs with `ref="x"`) → `Modal.getOrCreateInstance(el.value)` → `.show()`/`.hide()`; attach a `'hidden.bs.modal'` listener as a safety net when using it as a promise-based picker (see `mfkey32.pug`'s `editTextModal`). `data-dismiss`/`data-backdrop`/`data-keyboard` → `data-bs-*`; `button.close` (`&times;`) → `button.btn-close` (empty, styled via CSS, needs `aria-label="Close"`).

File import: hidden `input.d-none(type="file", ref="dumpImportInput", @change="dumpImport?.cb?.($event.target.files[0])", @cancel="dumpImport?.cb?.()")` + `dumpImport = reactive({ cb: null })` as a one-shot promise resolver, `useTemplateRef('dumpImportInput')` in place of the DOM ref.

## Icon convention

Icons are [Iconify](https://iconify.design/docs/usage/css/no-code/) SVGs via `.svgmask` (`background-color: currentColor` + CSS mask) — `span.svgmask(style="--svgmask-url: url(https://api.iconify.design/<set>:<name>.svg)")`. Always `mdi:` (Material Design Icons), one exception (`icon-park-outline:tips` in `test.pug`).

- Sizing: `.fs-1dot5em` inside a `<button>`, `.fs-1dot2em` beside a header/title (`card-header`, `modal-title`, `alert-heading`). Missing either is likely a bug — check for Pug's `.col: button.foo(...)` colon syntax, which a naive `grep '^\s*button'` misses.
- Same action → same icon everywhere: Load device/slot config → `mdi:logout`; Save/Emulate (push config to device) → `mdi:login`; Read/Scan a physical tag → `mdi:tag-arrow-down-outline`; Write a physical tag → `mdi:tag-arrow-up-outline`; Import a file → `mdi:file-import-outline`; Export a file → `mdi:file-export-outline`; Reset/clear to defaults → `mdi:restore`; clear one field → `mdi:close`; recover a key (mfkey32) → `mdi:lock-open-variant-outline`.
- `.ls-n1px` on a button whose label is multi-word or a single word ≥8 chars; short words (Load, Read, Write, Scan, Import, Export, Check, Verify, CSV) skip it. In the stacked icon-over-text layout (`.d-flex.flex-column`), the tighter `.ls-n2px` on the label already covers this — don't double up.

## Other conventions

- No `.btn-block` (→ `.w-100`/`.d-grid`), no `.input-group-prepend`/`-append` (flush inside `.input-group`), no `.custom-control`/`.custom-checkbox` (→ `.form-check*`), `.text-left`/`-right` → `.text-start`/`-end`, `.pl-*`/`.pr-*` → `.ps-*`/`.pe-*`.
- No shared page-specific JS module beyond `bootstrap5-utils.mjs` — feature logic (well-known keys, hex helpers, dump (de)serialization) is duplicated per page; check a similar existing page first.

## Adding a new demo page

1. `pug/src/<name>.pug`, `extends /include/bootstrap5`, follow `test.pug` (minimal), `hf14a-scanner.pug`/`mifare-value.pug` (simple device tool), or `mfkey32.pug`/`mifare1k.pug` (modals + file import/export).
2. Add an entry to `documents/demos.md` if it should be discoverable.
3. Verify with `yarn build:pug` + `yarn lint:ci`, then eyeball `dist/<name>.html`: no BS4 classes, no stray module-scope identifiers in the template, unique `<label for>`/`id` pairs, import-map entries resolve.
