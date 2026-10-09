# Changelog

`@capsulate/mcp`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## Unreleased

- No changes yet.

## 0.3.0 (2026-10-09)

- Live computer use (target 0.3.0): `capsulate_console_link`, `capsulate_say`, `capsulate_control`, `capsulate_handoff` and `capsulate_wait_for_handback`. A person watches the live screen, takes it over and hands it back; the AI's input answers `human_in_control` while they hold it, and the tool result says how to wait.
- Desktop verbs the server lacked: `capsulate_move`, `capsulate_scroll`, `capsulate_drag`, `capsulate_ui_tree`, `capsulate_find_element`, `capsulate_wait_element`, `capsulate_click_element`, `capsulate_clipboard`, `capsulate_windows`, `capsulate_ocr`.
- Server instructions tell the model how to work on a screen a person watches: narrate, prefer elements over pixels, hand over for sign ins and secrets.
- `CAPSULATE_API_KEY_FILE` reads the key from a file (bare key or a `CAPSULATE_API_KEY=` line), so MCP configs never hold it.
- `scripts/smoke-live.mjs` runs the live tools end to end against a fake API.

## 0.2.0 (2026-09-12)

- `click`, `type` and `key` accept `screenshot` and `screenshotDelayMs` and return the frame as image content.
- Repository moved to `github.com/capsulatedev/capsulate`; `mcpName` (`io.github.capsulatedev/capsulate`) added for the MCP registry.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
