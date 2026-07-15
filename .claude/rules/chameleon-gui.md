---
paths:
  - "src/**/*.ts"
  - "pug/**/*"
---

# Reference implementation: GameTec-live/ChameleonUltraGUI

[GameTec-live/ChameleonUltraGUI](https://github.com/GameTec-live/ChameleonUltraGUI) is a third-party (not RfidResearchGroup) cross-platform GUI app for the device, written in Flutter/Dart — available on Windows, Linux, macOS, iOS, and Android. It's not affiliated with this SDK or the official CLI, but it implements nearly the same feature set with a full graphical UX, which makes it the best comparison point when designing or debugging a **user-facing feature** (as opposed to `chameleon-cli.md`'s CLI-workflow angle or `firmware.md`'s wire-protocol angle).

Source layout (`chameleonultragui/lib/`):

- `bridge/chameleon.dart` — the device command wrapper, the Dart analogue of `ChameleonUltra.ts`'s `cmdXxx()` methods / Python's `chameleon_cmd.py`. Check this alongside [.claude/rules/chameleon-cli.md](chameleon-cli.md)'s `chameleon_cmd.py` when a command's expected usage pattern is unclear.
- `bridge/dfu.dart` — firmware update flow (already linked as a related resource from this repo's own `documents/demos.md` DFU section) — the Dart analogue of `src/plugin/DfuZip.ts` + the `cmdDfuEnter()`/DFU frame handling in `ChameleonUltra.ts`.
- `connector/serial_*.dart` (`serial_abstract`, `serial_android`, `serial_ble`, `serial_macos`, `serial_mobile`, `serial_native`, `serial_emulator`) — one file per platform transport, the Dart analogue of this repo's `src/plugin/*Adapter.ts` (plus a bundled mock/emulator transport, analogous to `BufferMockAdapter`).
- `gui/page/*.dart` — one file per feature screen; the most direct cross-reference for a `pug/` demo page's equivalent feature:
  - `slot_manager.dart` ↔ slot-related parts of `device-settings.pug`/`mifare1k.pug`
  - `read_card.dart` / `write_card.dart` ↔ the MIFARE/Ultralight read-write flows across `mifare1k.pug`, `mifare-xiaomi.pug`, `mifare-value.pug`
  - `settings.dart` ↔ `device-settings.pug`
  - `flashing.dart` ↔ `dfu.pug`
  - `tools.dart` ↔ misc single-purpose tools (comparable to `mfkey32.pug`, `mifare1k-acls.pug`, `hf14a-scanner.pug`, `lf-em410x.pug`)
  - `connect.dart` / `pending_connection.dart` ↔ this repo's dual-adapter connect flow (see `.claude/rules/demo-pages.md`)
  - `debug.dart` ↔ this repo's `Debug` plugin / `'debug'` event usage
- `recovery/` — MIFARE Classic key-recovery attacks (nested/darkside/hardnested), the Dart analogue of `src/Crypto1.ts` and the `cmdMf1...Nested`/`cmdMf1...Darkside` methods, and of the native C attacks in the CLI's `software/src/` (see `.claude/rules/chameleon-cli.md`).
- `protobuf/` — a Protocol Buffers schema used for some of this app's own data (not the device's raw SOF+LRC wire protocol — don't confuse the two).

Use the GitHub MCP tools (`search_code`, `get_file_contents`) to look these up directly — this is a large, independently-evolving Flutter codebase, not something to reconstruct from memory.
