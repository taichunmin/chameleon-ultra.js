---
paths:
  - "public/**/*"
---

# Static assets

`public/` is tsup's `publicDir` (see `sharedConfig.publicDir` in `tsup.config.ts`) — everything in it is copied verbatim into `dist/` on `yarn build:js`, alongside the compiled bundles. This means anything placed in `public/` gets published to npm and the GitHub Pages site as-is, so **never put a CLAUDE.md or other repo-internal doc inside `public/`** — keep guidance about this folder here instead.

Currently holds:

- `context7.json` — Context7 documentation integration config, copied to `dist/context7.json` so it's served from the published site.
- `img/chameleon-ultra.svg`, `img/nfc.svg` — icons referenced by the `pug/` demo pages via `${baseurl}img/*.svg` (see the `.bgicon-*` classes in `pug/include/bootstrapV4.pug`).

Treat it as plain static output, not source to compile — add files here only when they need to ship as-is at the site root.
