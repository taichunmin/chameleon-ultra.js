# Fix GitHub issue #235: avoid redundant install+test+build in CI

## Context

[Issue #235](https://github.com/taichunmin/chameleon-ultra.js/issues/235) ("improve the CI workflow"): the `Crypto1` test suite is slow, and `.github/workflows/ci.yml` currently runs the full `yarn` install → `yarn test:ci` → `yarn build` sequence **twice** on every push to `master` — once in the `test` job, and again from scratch in the `deploy` job (which needs `dist/` for the GitHub Pages deploy + npm publish, and needs coverage output for the Coveralls upload). The fix requested: build/test once in the `test` job, upload the results as a GitHub Actions artifact, and have `deploy` download and reuse them instead of rebuilding.

While in there, also bump every third-party Action reference across all 3 workflow files to its current latest released version (checked live via GitHub releases, not memory).

Confirmed by reading the current workflows:
- `ci.yml` `test` job: checkout → setup-node → `yarn && yarn lint && yarn test:ci && yarn build && yarn publish:test`.
- `ci.yml` `deploy` job (gated on `github.ref == 'refs/heads/master'`, `needs: test`): checkout → setup-node → `yarn && yarn test:ci && yarn build` (the redundant part) → Coveralls → configure-pages → upload-pages-artifact (`./dist`) → deploy-pages → `JS-DevTools/npm-publish@v4` (no `token` input — relies on npm **trusted publishing** via the workflow's `permissions.id-token: write`) → jsDelivr purge.
- `yarn test:ci` = `vitest --run --coverage`; there's no vitest config file, so coverage output goes to the default `coverage/` dir (matches `coverage` already listed in both `.gitignore` and `.npmignore`).
- Verified via `JS-DevTools/npm-publish`'s own README that with OIDC trusted publishing (which this repo already uses, no `token:` input), the action needs no `actions/setup-node` step — it's a self-contained bundled action, not a wrapper around the system `npm` CLI. Same is true of `coverallsapp/github-action`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`, and `egad13/purge-jsdelivr-cache`. So the `deploy` job doesn't need Node/yarn set up at all once it isn't building.

Latest release versions confirmed live via GitHub (`get_latest_release`) for every action used across all 3 workflow files:

| Action | Currently pinned | Latest | Bump? |
|---|---|---|---|
| `actions/checkout` | `v6` (ci.yml) / `v4` (release.yml) | `v7.0.0` | yes, both |
| `actions/setup-node` | `v6` (ci.yml) / `v4` (npm-test.yml) | `v7.0.0` | yes, both |
| `coverallsapp/github-action` | `v2` | `v2.3.6` | no (major unchanged) |
| `actions/configure-pages` | `v4` | `v6.0.0` | yes |
| `actions/upload-pages-artifact` | `v3` | `v5.0.0` | yes |
| `actions/deploy-pages` | `v4` | `v5.0.0` | yes |
| `JS-DevTools/npm-publish` | `v4` | `v4.1.5` | no (major unchanged) |
| `egad13/purge-jsdelivr-cache` | `v1` | `v1.1.0` | no (major unchanged; owner may have renamed to `kaycodes13` upstream but the old owner/repo still resolves via GitHub's redirect, so leaving the reference as-is) |
| `ncipollo/release-action` | `v1` | `v1.21.0` | no (major unchanged) |
| `actions/upload-artifact` (new) | — | `v7.0.1` | use `v7` |
| `actions/download-artifact` (new) | — | `v8.0.1` | use `v8` |

## Plan

### 1. `.github/workflows/ci.yml` — fix the redundant test/build + bump versions

Bump `actions/checkout@v6` → `@v7` (both jobs) and `actions/configure-pages@v4` → `@v6`, `actions/upload-pages-artifact@v3` → `@v5`, `actions/deploy-pages@v4` → `@v5` (deploy job). Leave `coverallsapp/github-action@v2`, `JS-DevTools/npm-publish@v4`, `egad13/purge-jsdelivr-cache@v1` as-is (already latest major).

**In the `test` job**, bump `actions/setup-node@v6` → `@v7`, and after the existing `install, lint, test, build` step, add a step to upload `dist/` and `coverage/` as a single artifact, gated to only run on `master` pushes (PRs never reach the `deploy` job today, so no point uploading there):

```yaml
      - name: Upload build output
        if: github.ref == 'refs/heads/master'
        uses: actions/upload-artifact@v7
        with:
          name: build-output
          path: |
            dist/
            coverage/
          retention-days: 3
```

**In the `deploy` job**, remove the `actions/setup-node@v6` step and the entire `install and build` step (the redundant `yarn && yarn test:ci && yarn build`), replacing them with a download of the artifact right after checkout:

```yaml
      - uses: actions/checkout@v7
      - name: Download build output
        uses: actions/download-artifact@v8
        with:
          name: build-output
```

Everything after that (Coveralls, configure-pages, upload-pages-artifact, deploy-pages, npm-publish, jsDelivr purge) stays exactly as-is — those steps only need `dist/`/`coverage/` and the checked-out repo (`package.json`, `README.md`, `LICENSE`, `.npmignore`) to already be present, which they will be.

### 2. `.github/workflows/npm-test.yml` — version bump only

Bump `actions/setup-node@v4` → `@v7`. No other changes (this workflow is an unrelated manual smoke-test of the published npm package).

### 3. `.github/workflows/release.yml` — version bump only

Bump `actions/checkout@v4` → `@v7`. Leave `ncipollo/release-action@v1` as-is (already latest major). No other changes (this workflow just creates a GitHub Release on tag push, unrelated to the test/build duplication).

## Verification

- Review the edited YAML carefully for indentation/step ordering (no local GitHub Actions runner available).
- Push to a branch / open a PR first: confirm the `test` job (with bumped `checkout`/`setup-node`) still passes and, since it's not `master`, skips the new upload step.
- Merge to `master` (or use `workflow_dispatch`) and watch the Actions run: confirm `test` uploads the `build-output` artifact, `deploy` downloads it (no reinstall/build in its logs, bumped actions all resolve and run), and Coveralls upload, GitHub Pages deploy, and npm publish all still succeed — and that total run time drops since `deploy` no longer reruns the slow test suite.
- Separately trigger `npm-test.yml` (`workflow_dispatch`) and confirm it still passes with `setup-node@v7`.

## Post-approval fixes (found from an actual CI run)

After the plan above was implemented and pushed, the `test` job failed at the `actions/setup-node@v7` step:

```
error Error: Failed to replace env in config: ${NODE_AUTH_TOKEN}
    at NpmRegistry.normalizeConfig (.../yarn/lib/cli.js:31940:69)
```

**Root cause:** `actions/setup-node`'s `registry-url` input always writes an `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`. Yarn Classic (v1.22.22) eagerly evaluates that config for *any* yarn invocation — including the internal `yarn cache dir` probe `setup-node` runs to resolve its cache path when `cache: yarn` is set — and throws if `NODE_AUTH_TOKEN` isn't set. Nothing in this repo's CI ever set that env var, since publishing goes through `JS-DevTools/npm-publish`'s OIDC trusted publishing, not `npm`/`yarn publish` directly.

**Fix 1 — drop the unneeded `registry-url`:**
- `ci.yml`'s `test` job: removed `registry-url: 'https://registry.npmjs.org'` from its `actions/setup-node@v7` step (that job only lints/tests/builds/`npm pack --dry-run` — no registry auth needed).
- `npm-test.yml`: removed the same `registry-url` line (that workflow only does a scratch `yarn add` smoke test — no registry auth needed there either).

**Fix 2 — `deploy` job still needs *some* pinned Node/npm, for a different reason:** while investigating, confirmed by reading `JS-DevTools/npm-publish`'s source (`src/npm/call-npm-cli.ts`, `src/npm/use-npm-environment.ts`) that it does **not** implement publish via raw HTTP — it shells out to the system `npm` CLI via `child_process.spawn`, using its own scoped temp `.npmrc` (which is why it doesn't touch `~/.npmrc`). Its README states OIDC trusted publishing requires **npm ≥11.5.1**. With `setup-node` entirely removed from `deploy` (per the original plan, since none of its other steps are Node-based actions), that job would depend on whatever `npm` version happens to be pre-baked into the `ubuntu-latest` runner image — unpinned and not guaranteed to meet that minimum.

The `test` job's failed run log incidentally proved the fix: `actions/setup-node@v7` with `node-version: lts/*` resolves to Node 24.18.0 / **npm 11.16.0** — comfortably above the OIDC minimum. So `deploy` now has:

```yaml
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: lts/*
      - name: Download build output
        uses: actions/download-artifact@v8
        with:
          name: build-output
```

Deliberately **no** `registry-url` (the action manages its own scoped `.npmrc`, so setup-node's global one is both unneeded and was the source of Fix 1's crash) and **no** `cache: yarn` (nothing in `deploy` runs yarn, so there's no cache to prime and no risk of the eager `.npmrc` env-var crash recurring).

**Fix 3 — Coveralls had "nothing to report":** confirmed via Vitest's own docs (Context7) that `coverage.reporter` defaults to `['text', 'html', 'clover', 'json']` — **no `lcov`** — so `coverage/lcov.info` was never generated in the first place, regardless of the CI restructuring. `coverallsapp/github-action@v2` looks for `./coverage/lcov.info` by default and had genuinely nothing to find. This was a pre-existing gap, just newly surfaced now that the pipeline actually depends on that file flowing correctly through the `build-output` artifact.

Fixed in `package.json`:

```diff
- "test:ci": "yarn test --run --coverage",
+ "test:ci": "yarn test --run --coverage --coverage.reporter=text --coverage.reporter=lcov",
```

(Vitest CLI array options must be repeated per-value, not comma-separated — confirmed via Vitest docs. Passing `--coverage.reporter` via CLI replaces the config default array rather than merging with it, so `text` is re-added explicitly alongside `lcov` to keep a readable summary in the CI job log.)

Also made the coverage provider explicit (`--coverage.provider=v8`) — confirmed via Vitest docs that `v8` is already the default and matches the `@vitest/coverage-v8` package already installed (not `-istanbul`), so this is a no-op today, just documentation-as-config against future default changes.

Note: per Vitest's own CLI docs, the bare `--coverage` flag is *not* redundant alongside `--coverage.provider=`/`--coverage.reporter=` — dot-notation options configure nested settings but do not themselves flip `coverage.enabled` to `true` ("Remember to always include `--coverage.enabled` when using dot notation for coverage options"). `--coverage` is the one doing that; the dotted flags only apply once coverage is already enabled.

## Fix 4 (supersedes Fix 3's root-cause theory) — the real reason Coveralls had "nothing to report"

Fix 3 turned out to be treating a symptom, not the actual cause. The real bug: `package.json`'s `"test": "vitest -r ./src --testTimeout 180000"` sets Vitest's `root` to `./src`, and `coverage.reportsDirectory` (default `'./coverage'`) resolves **relative to that root** — so coverage output has always landed at `src/coverage/`, not `<repo-root>/coverage/`. Confirmed two ways:
1. Reproduced locally: `yarn vitest -r ./src run src/helper.test.ts --coverage ...` → `./src/coverage/lcov.info`, not `./coverage/lcov.info`.
2. The pre-PR (working) CI log literally shows `Detected coverage file: src/coverage/clover.xml`.

This means Vitest's default reporters (`clover` included) were already producing a Coveralls-supported format (confirmed: Clover XML is in `coverallsapp/coverage-reporter`'s supported-formats list) at `src/coverage/` all along — Fix 3's `lcov` reporter addition wasn't the missing ingredient. The actual bug was in `ci.yml`'s `Upload build output` step: it captured `coverage/` (repo-root-relative), which never matched anything, so the coverage report silently never made it into the artifact (`upload-artifact`'s default `if-no-files-found: warn` doesn't fail the step). `deploy` then had nothing to find, since it no longer re-runs the test suite itself (that's the point of this whole fix). Pre-PR this was masked because `deploy` generated `src/coverage/` fresh, in its own job, immediately before the Coveralls step ran — no cross-job hand-off was ever involved.

**Fix:** in `ci.yml`'s `Upload build output` step, changed the artifact path list:

```diff
  path: |
    dist/
-   coverage/
+   src/coverage/
```

`download-artifact` preserves the relative structure from upload (least-common-ancestor of `dist/` and `src/coverage/` is the repo root), so this restores the file to `deploy`'s workspace at the exact same `src/coverage/...` location it always lived at pre-PR — no other config changes needed for Coveralls to find it again via its normal recursive auto-search.

**Fix 3's `package.json` change was reverted** (per explicit request) since it wasn't the actual fix: `test:ci` is back to `"yarn test --run --coverage"`, relying on Vitest's default `clover` reporter (already Coveralls-supported) rather than adding an explicit `lcov` reporter.
