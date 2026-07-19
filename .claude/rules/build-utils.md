---
paths:
  - "build-utils/**/*"
---

# build-utils/ — Build & docs-site scripts

One-off Node scripts (run via `tsx`) that post-process build output; not part of the library's runtime code. Each script resolves paths relative to its own `__dirname` (via `fileURLToPath(import.meta.url)`), not the repo root or `process.cwd()`.

- `cjsInterop.ts` (`yarn build:cjsInterop`) — patches tsup's generated `dist/**/*.d.ts` and matching `.js` files that do a single `export { X as default } from '...'` re-export, rewriting them to `import { X } from '...'; export = X;` / `module.exports = X;`. Needed because tsup's CJS output for single-default-export entry points (e.g. `Crypto1`, each `plugin/*`) isn't `require()`-interop-friendly otherwise. Run after `build:js`, before `build:docs`.
- `typedoc.ts` (`yarn build:sitemap`, runs before `sitemap.ts` in that script — not part of `build:docs`, which is just `typedoc` with no post-pass) — three passes over `dist/**/*.html`: (1) substitutes the literal `package.json` version into the rendered `dist/variables/index.version.html` page (typedoc renders the `VERSION_SUPPORTED`-adjacent `version` export's source `...` placeholder, not the real value, since it's set via `process.env.VERSION` at tsup build time); (2) injects a shared `og:image`/`og:image:width`/`og:image:height` `<meta>` block into any page missing one; (3) injects the Context7 chat widget `<script>` tag into any page missing it. `build:sitemap` runs last in the top-level `build` script (after both `build:docs` and `build:pug`), so (2)/(3) see every page — in practice they only add anything to typedoc's own pages, since every `pug/` demo page already sets its own `og:image` via `bootstrap5.pug`'s `ogImage` local (see `.claude/rules/demo-pages.md`).
- `sitemap.ts` (part of `yarn build:sitemap`, after `typedoc.ts`) — globs all `dist/**/*.html` (typedoc pages + `pug/` demo pages together) and writes `dist/sitemap.xml` + chunked `dist/sitemap_N.xml` (1000 URLs/chunk) via `pug/dotenv.ts#getSiteurl()`.
- `yarn dev:docs`/`yarn dev:pug` each also re-run `yarn build:sitemap` after their respective rebuild, so the injected meta/sitemap stay current during `yarn dev`, not just on a full `yarn build`.
- `https.ts` (`yarn dev:https`) — local HTTPS dev server for `dist/` (via `serve-static` + `finalhandler`), with a `livereload` server attached so the docs/demo pages auto-refresh on file change. Requires certs from `yarn mkcert` first (reads `../mkcert/{cert,key}.pem`; throws with a reminder if missing). Also watches `./pug` and logs the URL of any changed `pug/src/*.pug` page — it does not rebuild the page itself, that's `yarn dev:pug`'s job (a separate nodemon watcher); this script only refreshes the browser once `yarn dev:pug` has rewritten the corresponding `dist/*.html`.
- `typedoc-custom.css` — extra stylesheet loaded via `customCss` in `../typedoc.json`, layered on top of the default typedoc-plugin-markdown/theme output.

None of these scripts have their own tests; verify changes by running the corresponding `yarn build:*` script and checking `dist/` output.
