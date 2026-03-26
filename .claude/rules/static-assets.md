---
paths:
  - "public/**/*"
---

# Static assets

`public/` is tsup's `publicDir` (see `sharedConfig.publicDir` in `tsup.config.ts`) — everything in it is copied verbatim into `dist/` on `yarn build:js`, alongside the compiled bundles. This means anything placed in `public/` gets published to npm and the GitHub Pages site as-is, so **never put a CLAUDE.md or other repo-internal doc inside `public/`** — keep guidance about this folder here instead.

Currently holds:

- `context7.json` — Context7 documentation integration config, copied to `dist/context7.json` so it's served from the published site.
- `img/chameleon-ultra.svg`, `img/nfc.svg` — the two bespoke icons referenced by the `pug/` demo pages via `${baseurl}img/*.svg` (see the `.svgmask-chameleon-ultra`/`.svgmask-nfc` classes in `pug/include/bootstrap5.pug`). Every other demo-page icon is an [Iconify](https://iconify.design/) SVG fetched directly from `api.iconify.design` at runtime, not a local asset — see `.claude/rules/demo-pages.md`'s icon convention section.
- `js/bootstrap5-utils.mjs` — a real ES module, not build tooling: shared browser-runtime helpers (`showLoading`, `swalFire`, `swalConfirm`, `loadPageStorage`/`savePageStorage`, etc.) imported by every `pug/src/*.pug` demo page via the `@app/` import-map entry (`@app/js/bootstrap5-utils.mjs` → `${baseurl}js/bootstrap5-utils.mjs`). Edit it directly; there's no separate build step for it beyond the verbatim copy into `dist/`. See `.claude/rules/demo-pages.md` for what it exports and the conventions around it.

Treat it as plain static output, not source to compile — add files here only when they need to ship as-is at the site root.
