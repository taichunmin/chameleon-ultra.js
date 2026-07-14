---
paths:
  - "src/**/*.ts"
  - "documents/**/*.md"
---

# Protocol/user docs: RfidResearchGroup/ChameleonUltraDocs

[RfidResearchGroup/ChameleonUltraDocs](https://github.com/RfidResearchGroup/ChameleonUltraDocs) is the source repo for the device's [GitHub Wiki](https://github.com/RfidResearchGroup/ChameleonUltra/wiki) (per its `README.md`: "Everything here will automatically be deployed to the wiki and other places"). It's the current, authoritative user/protocol documentation for the device — **this is the correct replacement for the old, now-dead `docs/protocol.md` link** flagged in [.claude/rules/firmware.md](firmware.md).

**Workflow: when writing or updating a TSDoc comment for a `cmdXxx()` method (or any protocol-level doc in this repo), check `protocol.md` in this docs repo first, then link back to it.**

- `protocol.md` documents every command by number, in `### <cmdNumber>: <CMD_NAME>` sections (e.g. `### 1000: GET_APP_VERSION`), each with its command/response payload layout, the equivalent CLI command (`* CLI: cf ...`), and often extra notes/gotchas not obvious from the firmware source alone (e.g. timing quirks, edge cases, guideline rationale). Always check this before writing/updating a `cmdXxx()` doc comment — it's frequently more complete than the firmware C source or this SDK's existing comment.
- Section anchors follow GitHub's heading-slug rule: `#<cmdNumber>-<cmd_name lowercased>`, e.g. `GET_APP_VERSION` (1000) → `#1000-get_app_version`. Link to `https://github.com/RfidResearchGroup/ChameleonUltraDocs/blob/main/protocol.md#<anchor>` (or the wiki URL, `https://github.com/RfidResearchGroup/ChameleonUltra/wiki/protocol#<anchor>` — both resolve to the same content) via a TSDoc `@see` tag, replacing any stale `docs/protocol.md` link found in existing comments.
- `sdk.md` has a section for **this exact package** (`taichunmin/chameleon-ultra.js`) — check it when updating the main README's description/badges, to keep the two in sync.
- `cli.md` — official CLI install/usage guide; cross-reference alongside [.claude/rules/chameleon-cli.md](chameleon-cli.md) (the CLI's own source) when documenting a feature that has a CLI equivalent.
- Other pages worth knowing about: `firmware.md` (device firmware capabilities overview — a wiki page, distinct from this repo's own `.claude/rules/firmware.md`), `development.md` (building firmware from source), `hardware.md`, `technical_whitepaper.md`, `troubleshooting.md`, `faq.md`.
- This repo has branch protection (no direct pushes to `main`, PRs required) — treat it as read-only reference material unless the user explicitly asks to contribute a fix upstream.

Use the GitHub MCP tools (`get_file_contents`, `search_code`) to fetch `protocol.md` (and other pages) directly rather than relying on memory — it's actively maintained and the authoritative source.
