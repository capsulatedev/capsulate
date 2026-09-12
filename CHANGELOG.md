# Changelog

All four packages share a version.

## 0.2.0 (2026-09-12)

- SDK: deep computer-use verbs `uiTree`, `findElement`, `waitElement`, `clipboardGet`, `clipboardSet`, `windowList`, `windowFocus`, `ocr`, `trace`; `checkpoint`, `listCheckpoints`, `rollback`; the find-act-verify helpers `findAndClick`, `clickText`, `fillByName`, `locate`, `verify`, `report`; optional `screenshot` and `screenshotDelayMs` on every input verb to get a frame back after the action.
- CLI: `-s/--shot`, `--shot-delay` and `--shot-out` on `click`, `move`, `scroll`, `drag`, `type` and `key`; default size is now `1c2g`.
- MCP server: `click`, `type` and `key` accept `screenshot` and `screenshotDelayMs` and return the frame as image content.
- ai-tools: 19 tools (was 7), adding `screenshot`, `ui_tree`, `find_element`, `click_element`, `type_text`, `press_keys`, `wait_element`, `ocr`, `clipboard`, `checkpoint`, `rollback`, `get_trace`.
- Repository moved to `github.com/capsulatedev/capsulate`; `mcpName` added for the MCP registry.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
