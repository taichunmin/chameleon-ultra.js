# Usage rules

- Every `ChameleonUltra` instance must register exactly one adapter via `ultra.use(new XXXAdapter())` before use; never call device methods without registering an adapter first.
- To support multiple adapters at once, create separate `ChameleonUltra` instances, one per adapter — do not try to swap adapters on a single instance at runtime.
- Available adapters: `WebserialAdapter` (browser), `WebbleAdapter` (browser), `SerialPortAdapter` (Node.js). Import published adapters from `chameleon-ultra.js/plugin/<AdapterName>`; `BufferMockAdapter` is test-only and is imported from `src/plugin/BufferMockAdapter` within this repo.
- The library re-exports its own `Buffer` (backed by `@taichunmin/buffer`) via `import { Buffer } from 'chameleon-ultra.js'` — use this, not Node's global `Buffer` or `Uint8Array`.
- `ultra.connect()` is called automatically by adapters/commands when needed; call `ultra.disconnect()` to close the connection explicitly.
- Recommend enabling the `Debug` plugin or subscribing to the `'debug'` event when troubleshooting instead of guessing at protocol internals.
- Web Bluetooth/Web Serial require a secure context (HTTPS) and must be triggered from a user gesture (e.g. a click), not called on page load.
- Recommend using `mkcert` for a local dev HTTPS server (`yarn mkcert`, then `yarn dev:https`).
- Via CDN/global script tags, the library is namespaced under `window.ChameleonUltraJS` — destructure from that object.
- `cmdDfuEnter()` disconnects the device and it re-enumerates as a new USB/BLE device in bootloader mode — reconnecting to it also requires a fresh user-gesture-triggered device selection, not an automatic reconnect.
- The current firmware of ChameleonUltra only supports single-command execution. Ensure the previous command has fully completed before sending the next.
- If you change the BLE pairing password, you must delete the paired device from both the hardware and your mobile device.
