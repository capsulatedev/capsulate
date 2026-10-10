# Changelog

`@capsulate/sdk`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## 0.4.0 (2026-10-10)

- The complete toolset (LCU M2.6), on the `Capsule` handle and the `capsules` resource, served on Linux and Windows alike: `elementAction(action, selector, { value, window, index })` acts on an element without coordinates (`set_value`, `clear`, `toggle`, `expand`, `collapse`, `invoke`, `select` with an option by name, `focus`, `scroll_into_view`), with the `setValue(selector, value)` shortcut on the handle; `windowAction(action, { id | title }, { x, y, w, h })` (`minimize`, `maximize`, `restore`, `close`, `move`, `resize`, `focus`); `open(target, { kind, waitMs })` opens a URL, a file or an app by name and can wait for its window; `waitFor(condition, ...)` waits in the capsule for `present`, `absent`, `enabled`, `text`, `window` or `screen_stable` without holding up other calls; `screenInfo()`. `screenshot({ format, quality, scale, x, y, w, h })` returns JPEG, a scaled image or a region (a 1280x800 screen goes from about 42 KiB to 10 KiB as JPEG at half scale). `runActions` takes `element`, `window`, `open`, `wait_for` and `screen` steps. `CapsulateError.code` gives the machine code of a refused call (`not_found`, `unsupported`, `human_in_control`).
- `setPace(pace)` on the `Capsule` handle and the `capsules` resource: `natural` or `presentation` glide the pointer, type at a readable rate and leave a beat between the steps of a run while a person watches; `fast` is the default. `ControlStatus.pace`.
- The browser fast path (LCU M2): `capsule.browser` and `cap.capsules.browser(id)` drive the agent's own Chrome in a desktop capsule at page speed: `open`, `navigate`, `tabs`, `snapshot` (an outline with refs), `click`, `fill` (the value is never echoed), `select`, `press`, `scroll`, `wait`, `text`, `eval`, `screenshot`, and `run(verb, fields)`.
- `runActions(steps, { observe })` on the `Capsule` handle and the `capsules` resource: several steps in one call, run back to back on the server, stopping at the first that fails; `expect` waits for what should follow a step, `optional` lets one fail, `observe` returns a look at the end. Types `RunStep`, `RunActionsResult`, `RunStepResult`.
- A machine error code with a message (`422 browser_error`) now throws with the message.

## 0.3.0 (2026-10-09)

- Fix: `capsules.list()` and `history()` return `[]` when the team has no capsules (the API answers `null`), which made the MCP `capsulate_list` tool fail.
- Live computer use (target 0.3.0), on the `capsules` resource and the `Capsule` handle: `control`, `takeControl`, `releaseControl`, `handoff(note, {wait, timeoutMs})`, `waitForHandback`, `waitControl`, `say`, `consoleLink({mode, ttlSec})`, `revokeConsoleLinks`. `CapsulateError.isHumanInControl` marks an input refused because a person holds the screen.
- `checkpoint`, `listCheckpoints` and `rollback` on the `capsules` resource, addressed by session id (`cap.capsules.checkpoint(id, name)`), matching the methods on the `Capsule` handle.

## 0.2.0 (2026-09-12)

- Deep computer-use verbs `uiTree`, `findElement`, `waitElement`, `clipboardGet`, `clipboardSet`, `windowList`, `windowFocus`, `ocr`, `trace`; `checkpoint`, `listCheckpoints`, `rollback`; the find-act-verify helpers `findAndClick`, `clickText`, `fillByName`, `locate`, `verify`, `report`; optional `screenshot` and `screenshotDelayMs` on every input verb to get a frame back after the action.
- Repository moved to `github.com/capsulatedev/capsulate`.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
