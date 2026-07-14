---
paths:
  - "src/**/*"
---

# Core SDK architecture

Transport adapters and other plugins (`src/plugin/`) have their own topic rule; see [.claude/rules/adapters.md](adapters.md). Test-writing conventions have their own topic rule; see [.claude/rules/unit-test.md](unit-test.md).

## Core class: `src/ChameleonUltra.ts`

Everything revolves around the `ChameleonUltra` class (~5000 lines). Key mechanics:

- **No transport built in.** The class only knows about `this.port: UltraSerialPort | null` (see `src/types.ts`), an interface with `readable`/`writable` web streams (both nullable) plus optional `isOpen()`/`isDfu()`/`dfuWriteObject()`. A transport is provided by registering exactly one **adapter plugin** via `ultra.use(new XAdapter())`.
- **Plugin system**: `use(plugin)` calls `plugin.install({ Buffer, ultra }, option)`. Plugins register behavior via `ultra.addHook(hookName, middlewareFn)` (currently `connect` and `disconnect` hooks), composed with koa-style middleware chaining (`middlewareCompose` in `src/helper.ts`). This is how adapters, `Debug`, and `DfuZip` hook into connect/disconnect lifecycle without the core class knowing about them.
- **Two wire protocols, picked by mode**: `isDfu()` (backed by `port.isDfu?.()`) selects which framing is active. Normal mode reassembles bytes in `#ultraStartReading()` into `UltraFrame`s — ChameleonUltra's own custom framing: scan for the `START_OF_FRAME` marker (`0x11EF`), validate LRC checksums, cmd/status/data-len header. DFU/bootloader mode reassembles bytes in `#dfuStartReading()` into `DfuFrame`s, which implement Nordic's **nRF DFU (Secure DFU) protocol** framing (opcode + result code, SLIP-encoded on the wire — see `src/plugin/SlipEncoder.ts`), used only for firmware updates (`cmdDfuEnter`, `src/plugin/DfuZip.ts`). Both frame classes (`UltraFrame`, `DfuFrame`) are defined at the bottom of `ChameleonUltra.ts` itself, not in `decoder.ts`, and are emitted as `'resp'` events via the internal `CustomEventTarget` emitter (`src/CustomEventTarget.ts`).
- **Sending commands**: `#sendCmd()` packs `{cmd, status, data}` into a frame and writes it; `#createReadRespFn()` returns a function that waits on an `EventAsyncGenerator` (`src/EventAsyncGenerator.ts`) for a matching response (`cmd`, `op`, or custom `filter`), with per-call timeout (`readDefaultTimeout`, default 5000ms) and automatic error-to-exception conversion using `UltraErrMsg`/`DfuErrMsg` lookups from `src/enums.ts`.
- **Public API surface**: all device operations are exposed as `async cmdXxx()` methods (100+ of them) grouped by TSDoc `@group` tags (Device Related, Slot Related, Hf14a Related, Mf1 Related, Mfu Related, DFU Related, etc.). New device commands should follow this `cmdXxx` naming and grouping convention, calling the private `#sendCmd`/`#createReadRespFn` machinery rather than touching `port` directly.
- **Connection lifecycle**: `connect()`/`disconnect()` are invoked automatically by any `cmdXxx()` call if not already connected — callers don't normally need to call them explicitly.

## Supporting modules

- `src/enums.ts` — device protocol enums (`Cmd`, `DeviceMode`, `TagType`, `Mf1KeyType`, error code maps, etc.) plus `isXxx()` type-guard helpers for each enum.
- `src/types.ts` — shared interfaces/types (`UltraPlugin`, `UltraSerialPort`, `SlotSettings`, `Mf1*` dump/result shapes, etc.). Most exported types here are annotated `@inline @expand` for TypeDoc.
- `src/decoder.ts` — MIFARE/HF/LF response decode helpers (`Hf14aAntiColl`, `Mf1EmuSettings`, etc.) plus `bufIsLenOrFail` validation.
- `src/helper.ts` — `middlewareCompose` (koa-style hook composition), `sleep`, `versionCompare`.
- `src/Crypto1.ts` — standalone MIFARE Classic Crypto1 cipher/PRNG implementation, built and published as a separate entry point (`chameleon-ultra.js/Crypto1`).
- `src/CustomEventTarget.ts` / `src/EventAsyncGenerator.ts` — internal event plumbing used by the frame reader and response-waiting logic.
