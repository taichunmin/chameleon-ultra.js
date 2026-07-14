---
paths:
  - "src/**/*.ts"
  - "pug/**/*"
---

# Reference implementation: RfidResearchGroup/ChameleonUltra's Python CLI (`software/`)

The firmware repo also ships the official Python CLI in [`software/script/`](https://github.com/RfidResearchGroup/ChameleonUltra/tree/main/software/script) (`software/README.md`: "Chameleon Ultra CLI"; managed with `uv`, packaged via `software/pyinstaller.spec` into the `client-{linux,macos,windows}.zip` GitHub release assets). It's the reference implementation for nearly every device feature.

- `chameleon_enum.py` — `class Command(enum.IntEnum)` mirrors `Cmd` in `src/enums.ts` almost name-for-name (e.g. `Command.GET_APP_VERSION = 1000` ↔ `Cmd.GET_APP_VERSION = 1000`) — often a faster cross-reference than the firmware C headers in [.claude/rules/firmware.md](firmware.md).
- `chameleon_cmd.py` — `class ChameleonCMD`, one method per device command (e.g. `get_app_version()`, decorated `@expect_response(Status.SUCCESS)`). This is the direct Python analogue of `ChameleonUltra.ts`'s `cmdXxx()` methods — same request/response semantics, snake_case name is the camelCase `cmdXxx` name with the `cmd` prefix dropped (`get_app_version` ↔ `cmdGetAppVersion`). Read this first when a `cmdXxx()`'s payload encoding/decoding is unclear.
- `chameleon_cli_unit.py` — the actual CLI subcommands (`hf mf ...`, `lf em410x ...`, `hw slot ...`, etc.), one large file. This is the reference for **user-facing behavior and workflow** — what order of device calls a feature needs, what it validates client-side, how it formats output. Check this (not just `chameleon_cmd.py`) when implementing the equivalent feature in a `pug/` demo page, since the demo pages mirror CLI workflows more than raw command wrappers.
- `chameleon_com.py` — serial transport + frame (re)assembly, the Python analogue of this SDK's adapters ([.claude/rules/adapters.md](adapters.md)) plus the `UltraFrame`/`DfuFrame` parsing in [.claude/rules/sdk-architecture.md](sdk-architecture.md).
- `crypto1.py` and the native helpers under `software/src/` (`crypto1.c`, `crapto1.c`, `mfkey*.c`, `nested*.c`, `staticnested*.c`, `darkside.c`, built via `software/src/CMakeLists.txt`) — MIFARE Classic Crypto1 cipher and key-recovery attacks; `hardnested_utils.py` shells out to the compiled binaries. Cross-reference against `src/Crypto1.ts` and the `cmdMf1...`/nested/darkside methods in `ChameleonUltra.ts`.
- `software/script/tests/` (e.g. `test_ultra.py`) — the CLI's own tests, asserted against CLI text output (`self.r('hw raw -c GET_APP_VERSION', r'...')`) rather than raw bytes — a different style than this repo's `BufferMockAdapter` hex-based tests ([.claude/rules/unit-test.md](unit-test.md)), but useful for confirming a command's expected behavior/output.

Use the GitHub MCP tools (`search_code`, `get_file_contents`) to look these up directly rather than guessing from memory — `chameleon_cli_unit.py` and `chameleon_cmd.py` are large and change frequently as the CLI gains features ahead of (or behind) this SDK.
