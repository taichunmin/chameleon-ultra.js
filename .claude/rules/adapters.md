---
paths:
  - "src/plugin/**/*"
---

# Adapters and plugins

Most files in `src/plugin/` are tsdown entry points (published as `chameleon-ultra.js/plugin/XXX`, see `plugins` in `tsdown.config.mts`) and implement `UltraPlugin` (`{ name, install() }`, defined in `src/types.ts`); `SlipEncoder.ts` is an internal helper.

- `WebbleAdapter.ts` — Web Bluetooth transport (browser, or Node.js via `webbluetooth`).
- `WebserialAdapter.ts` — Web Serial API transport (browser), matches Chameleon Ultra's USB vendor/product IDs, handles both normal mode and DFU mode (SLIP-encoded) via `SlipEncoder.ts`.
- `SerialPortAdapter.ts` — Node.js `serialport` transport.
- `BufferMockAdapter.ts` — in-memory adapter for tests (this repo's and users' own, published as `chameleon-ultra.js/plugin/BufferMockAdapter`; its iife build stubs `stream/web` as empty and uses the browser's stream globals); queue bytes into `adapter.send`, inspect what was written in `adapter.recv`.
- `DfuZip.ts` — parses Nordic DFU `.zip` firmware packages (manifest + images) for `cmdDfuEnter`/firmware update flows.
- `Debug.ts` — plugin that pipes the `debug` event stream through the `debug` npm package's namespaced loggers.
- `SlipEncoder.ts` — SLIP encode/decode transform used by DFU mode framing.

When registering an adapter, always use exactly one per `ChameleonUltra` instance (`await ultra.use(new WebserialAdapter())`); adapters that detect they've been superseded (`ultra.$adapter !== adapter`) become no-ops in their hooks.

Adding a new plugin file meant to be imported standalone (`chameleon-ultra.js/plugin/Foo`) requires adding it to the `plugins` array in `tsdown.config.mts` (and to `entries.json` / the type fixtures in `.github/workflows/ci.yml`).
