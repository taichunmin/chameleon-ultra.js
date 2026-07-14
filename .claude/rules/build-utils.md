---
paths:
  - "build-utils/**/*"
---

# build-utils/ — Build & docs-site scripts

One-off Node scripts (run via `tsx`) that post-process build output; not part of the library's runtime code. Each script resolves paths relative to its own `__dirname` (via `fileURLToPath(import.meta.url)`), not the repo root or `process.cwd()`.

- `cjsInterop.ts` (`yarn build:cjsInterop`) — patches tsup's generated `dist/**/*.d.ts` and matching `.js` files that do a single `export { X as default } from '...'` re-export, rewriting them to `import { X } from '...'; export = X;` / `module.exports = X;`. Needed because tsup's CJS output for single-default-export entry points (e.g. `Crypto1`, each `plugin/*`) isn't `require()`-interop-friendly otherwise. Run after `build:js`, before `build:docs`.
- `typedoc.ts` (part of `yarn build:docs`, runs after `typedoc` itself) — substitutes the literal `package.json` version into the rendered `dist/variables/index.version.html` page (typedoc renders the `VERSION_SUPPORTED`-adjacent `version` export's source `...` placeholder, not the real value, since it's set via `process.env.VERSION` at tsup build time).
- `sitemap.ts` (`yarn build:sitemap`) — globs all `dist/**/*.html` (typedoc pages + `pug/` demo pages together) and: (1) writes `dist/sitemap.xml` + chunked `dist/sitemap_N.xml` (1000 URLs/chunk) via `pug/dotenv.ts#getSiteurl()`; (2) injects a shared `og:image` `<meta>` block into any page missing one; (3) injects the Context7 chat widget `<script>` tag into any page missing it. Run last, after both `build:docs` and `build:pug` have populated `dist/`.
- `https.ts` (`yarn dev:https`) — local HTTPS dev server for `dist/` (via `serve-static` + `finalhandler`), with a `livereload` server attached so the docs/demo pages auto-refresh on file change. Requires certs from `yarn mkcert` first (reads `../mkcert/{cert,key}.pem`; throws with a reminder if missing). Also watches `./pug` and logs the URL of any changed `pug/src/*.pug` page — it does not rebuild the page itself, that's `yarn dev:pug`'s job (a separate nodemon watcher); this script only refreshes the browser once `yarn dev:pug` has rewritten the corresponding `dist/*.html`.
- `typedoc-custom.css` — extra stylesheet loaded via `customCss` in `../typedoc.json`, layered on top of the default typedoc-plugin-markdown/theme output.

None of these scripts have their own tests; verify changes by running the corresponding `yarn build:*` script and checking `dist/` output.
