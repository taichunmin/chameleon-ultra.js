---
paths:
  - "src/plugin/**/*"
---

# Adapters and plugins

Most files in `src/plugin/` are tsup entry points (published as `chameleon-ultra.js/plugin/XXX`, see `entry` in `tsup.config.ts`) and implement `UltraPlugin` (`{ name, install() }`, defined in `src/types.ts`); `SlipEncoder.ts` is an internal helper and `BufferMockAdapter.ts` is used only for tests.

- `WebbleAdapter.ts` — Web Bluetooth transport (browser).
- `WebserialAdapter.ts` — Web Serial API transport (browser), matches Chameleon Ultra's USB vendor/product IDs, handles both normal mode and DFU mode (SLIP-encoded) via `SlipEncoder.ts`.
- `SerialPortAdapter.ts` — Node.js `serialport` transport.
- `BufferMockAdapter.ts` — in-memory adapter used exclusively for tests; queue bytes into `adapter.send`, inspect what was written in `adapter.recv`.
- `DfuZip.ts` — parses Nordic DFU `.zip` firmware packages (manifest + images) for `cmdDfuEnter`/firmware update flows.
- `Debug.ts` — plugin that pipes the `debug` event stream through the `debug` npm package's namespaced loggers.
- `SlipEncoder.ts` — SLIP encode/decode transform used by DFU mode framing.

When registering an adapter, always use exactly one per `ChameleonUltra` instance (`ultra.use(new WebserialAdapter())`); adapters that detect they've been superseded (`ultra.$adapter !== adapter`) become no-ops in their hooks.

Adding a new plugin file meant to be imported standalone (`chameleon-ultra.js/plugin/Foo`) requires adding it to the `entry` array in `tsup.config.ts`.
