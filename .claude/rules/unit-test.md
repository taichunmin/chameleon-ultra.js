---
paths:
  - "src/**/*.test.ts"
---

# Testing conventions

- Tests live alongside source as `*.test.ts` and use `vitest` (`describe`/`test`/`expect`/`vi`).
- Protocol-level tests (`src/ChameleonUltra.test.ts`) use `src/plugin/BufferMockAdapter`: push raw response bytes (hex strings, spaces allowed) into `adapter.send`, call the `cmdXxx()` under test, then assert on the decoded return value and on `adapter.recv` (the exact bytes the SDK sent to the "device"). This is the pattern to follow for any new `cmdXxx()` method.
- Set `ultra.readDefaultTimeout` low (e.g. 100ms) in tests that expect a timeout/error path so tests stay fast.

See root `CLAUDE.md`'s Commands section for the single-test-file/single-test-name invocation.
