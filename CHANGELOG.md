# Changelog

All four packages share a version.

## 0.3.0 (2026-10-09)

- Live computer use. A person watches a desktop capsule's screen in any browser while an AI drives it, and either can take turns. SDK: `consoleLink`, `say`, `control`, `takeControl`, `releaseControl`, `handoff` (hands the screen to the person and waits until they hand it back, returning their note), `waitForHandback`, `waitControl`, `revokeConsoleLinks`; `CapsulateError.isHumanInControl`.
- MCP server: `capsulate_console_link`, `capsulate_say`, `capsulate_control`, `capsulate_handoff` and `capsulate_wait_for_handback`, plus the desktop verbs `move`, `scroll`, `drag`, `ui_tree`, `find_element`, `wait_element`, `click_element`, `clipboard`, `windows` and `ocr`. Server instructions for working on a screen a person watches. `CAPSULATE_API_KEY_FILE` keeps the key out of MCP configs.
- CLI: `cap live`, `cap control`, `cap handoff`, `cap say`. `cap login` asks for a key or signs in through the browser (`--web`). Computer use from the terminal: `ui-tree`, `find`, `wait`, `clipboard`, `windows`, `focus`, `ocr`, `trace`, `checkpoint`, `rollback`.
- ai-tools: 23 tools, adding `console_link`, `say`, `handoff` and `control`; the same tools work with the Vercel AI SDK v4 and v5.
- Keys: a bare modifier followed by a key is one chord, so `["ctrl", "v"]` pastes.
- Examples: five runnable programs, each with its time and its cost in credits.
- Fix: `capsules.list()` returns `[]` for a team with no capsules.

## 0.2.0 (2026-09-12)

- SDK: deep computer-use verbs `uiTree`, `findElement`, `waitElement`, `clipboardGet`, `clipboardSet`, `windowList`, `windowFocus`, `ocr`, `trace`; `checkpoint`, `listCheckpoints`, `rollback`; the find-act-verify helpers `findAndClick`, `clickText`, `fillByName`, `locate`, `verify`, `report`; optional `screenshot` and `screenshotDelayMs` on every input verb to get a frame back after the action.
- CLI: `-s/--shot`, `--shot-delay` and `--shot-out` on `click`, `move`, `scroll`, `drag`, `type` and `key`; default size is now `1c2g`.
- MCP server: `click`, `type` and `key` accept `screenshot` and `screenshotDelayMs` and return the frame as image content.
- ai-tools: 19 tools (was 7), adding `screenshot`, `ui_tree`, `find_element`, `click_element`, `type_text`, `press_keys`, `wait_element`, `ocr`, `clipboard`, `checkpoint`, `rollback`, `get_trace`.
- Repository moved to `github.com/capsulatedev/capsulate`; `mcpName` added for the MCP registry.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
