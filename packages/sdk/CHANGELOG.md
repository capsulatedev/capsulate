# Changelog

`@capsulate/sdk`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## Unreleased

- No changes yet.

## 0.3.0 (2026-10-09)

- Fix: `capsules.list()` and `history()` return `[]` when the team has no capsules (the API answers `null`), which made the MCP `capsulate_list` tool fail.
- Live computer use (target 0.3.0), on the `capsules` resource and the `Capsule` handle: `control`, `takeControl`, `releaseControl`, `handoff(note, {wait, timeoutMs})`, `waitForHandback`, `waitControl`, `say`, `consoleLink({mode, ttlSec})`, `revokeConsoleLinks`. `CapsulateError.isHumanInControl` marks an input refused because a person holds the screen.
- `checkpoint`, `listCheckpoints` and `rollback` on the `capsules` resource, addressed by session id (`cap.capsules.checkpoint(id, name)`), matching the methods on the `Capsule` handle.

## 0.2.0 (2026-09-12)

- Deep computer-use verbs `uiTree`, `findElement`, `waitElement`, `clipboardGet`, `clipboardSet`, `windowList`, `windowFocus`, `ocr`, `trace`; `checkpoint`, `listCheckpoints`, `rollback`; the find-act-verify helpers `findAndClick`, `clickText`, `fillByName`, `locate`, `verify`, `report`; optional `screenshot` and `screenshotDelayMs` on every input verb to get a frame back after the action.
- Repository moved to `github.com/capsulatedev/capsulate`.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
