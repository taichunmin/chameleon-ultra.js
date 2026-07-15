---
paths:
  - "src/**/*.ts"
---

# Firmware dependency: RfidResearchGroup/ChameleonUltra

This SDK implements the wire protocol of the ChameleonUltra device's C firmware, [RfidResearchGroup/ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra). The two repos must stay in lockstep: a firmware protocol change (new command, changed payload, new status code) requires a corresponding change here, and the firmware repo is the authoritative source of truth when something doesn't match.

- **Command IDs** — `Cmd` in `src/enums.ts` mirrors `DATA_CMD_*` constants in the firmware's [`firmware/application/src/data_cmd.h`](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/firmware/application/src/data_cmd.h) 1:1 (same numeric value, `DATA_CMD_` prefix stripped, e.g. `DATA_CMD_GET_APP_VERSION (1000)` ↔ `Cmd.GET_APP_VERSION = 1000`). When adding a new `cmdXxx()` method, check this file first for the exact command number and confirm it's actually implemented in firmware (not just reserved).
- **Command payload behavior** — the actual request/response handling for each command lives in [`firmware/application/src/app_cmd.c`](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/firmware/application/src/app_cmd.c) (the `m_data_cmd_map[]` dispatch table plus each `cmd_processor_*` function). Read this when the payload format isn't obvious from this SDK's existing decode/encode code, or when firmware behavior seems to differ from what's implemented here.
- **Status/result codes** — `UltraResCode` in `src/enums.ts` mirrors `STATUS_*` constants in [`firmware/application/src/app_status.h`](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/firmware/application/src/app_status.h) (e.g. `STATUS_SUCCESS (0x68)` ↔ success in `isFailedUltraResCode`/`UltraErrMsg`).
- **Version gating** — `ChameleonUltra.VERSION_SUPPORTED` (`{ gte: '2.0', lt: '3.0' }` in `src/ChameleonUltra.ts`) tracks the firmware's release tags (e.g. `v2.2.0`). Bump this only after confirming compatibility against an actual firmware release, not just because a new tag exists.
- **`docs/protocol.md` links are stale** — several TSDoc comments in this repo (e.g. `src/ChameleonUltra.ts`'s `cmdXxx` payload docs) link to `github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/protocol.md`. That file no longer exists — the firmware repo's docs moved to its [GitHub Wiki](https://github.com/RfidResearchGroup/ChameleonUltra/wiki), sourced from [RfidResearchGroup/ChameleonUltraDocs](https://github.com/RfidResearchGroup/ChameleonUltraDocs). See [.claude/rules/chameleon-docs.md](chameleon-docs.md) for the replacement `protocol.md` and how to link to it correctly.
- **Other relevant firmware source**, for cross-referencing unfamiliar behavior: `ble_main.c`/`usb_main.c` (BLE/USB transport, counterparts to `WebbleAdapter`/`WebserialAdapter`/`SerialPortAdapter`), `settings.c` (device settings persistence, counterpart to `cmdSaveSettings`/`cmdResetSettings`), `rgb_marquee.c` (LED animation modes, counterpart to `AnimationMode`), `rfid_main.c` + `rfid/` (HF/LF reader logic).

Use the GitHub MCP tools (`search_code`, `get_file_contents`) to look up the firmware repo directly rather than guessing at protocol details from memory — firmware evolves independently of this SDK and file paths/constants can change between releases.
