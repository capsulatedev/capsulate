# Changelog

`@capsulate/sdk`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## 0.7.0 (2026-10-13)

- Skills: `cap.skills` (create, versions, approve, reject, roll back, import and export a folder or zip, save a capsule as a skill's environment, rehearse, weekly rehearsals). A skill is an Agent Skills folder (`SKILL.md`) plus `capsulate/skill.json`: its environment, inputs, procedures, checks and traps.
- `cap.capsules.launch({ skill })` starts a skill's environment and runs its setup; `runActions` takes `use` (a skill's procedure, with args), `frames`, `pixel`, `menus`, `check` and `save`.
- Runs: `cap.runs` (start in the background, read with a long poll, answer an `ask`, retry, skip or replace a failed step, cancel). `cap.inbox.list()`: what waits for someone.
- Lessons: `cap.lessons` (start, note, mark, pause, resume, finish, discard, events, digest, keyframes, draft, `onCapsule`, `addAudio` for the teacher's voice); start options `video` and `voice`.

## 0.6.0 (2026-10-12)

- `setCare(care)` on the `Capsule` handle and the `capsules` resource, and `ControlStatus.care`: how carefully the AI checks its work on a screen. `quick`: plan the whole job and run it in as few runs as possible, looking at the screen only to learn something or when a step failed; `careful`: check after every step; `balanced` is the default.
- `stroke(points, { smooth, closed, stepMs, button })` drags along a path of `[x, y]` points: curves, circles, a signature, any shape a hand draws. `smooth` draws a curve through the points, `closed` returns to the first one, `stepMs` is the pause between points (8 ms by default). `drag()` is unchanged.
- `runActions` takes up to 200 steps (was 50); a `drag` step takes a `path` too.

## 0.5.0 (2026-10-11)

- Visible mode: `setVisible(visible)` on the `Capsule` handle and the `capsules` resource, and `ControlStatus.visible`. On, the person wants to watch the whole task, so the AI does every step on the screen; off (the default), it works through commands first and uses the screen when it matters.
- `run(code, { lang: "powershell" })` runs a snippet in a Windows desktop's PowerShell, in the desktop session (about 0.3 s).
- `runActions` takes command and file steps: `exec` (`{ cmd, cwd?, env?, timeoutSec? }`; its timeout is cut to what is left of the run), `write_file` (`{ path, content }` or `{ path, contentB64 }`) and `read_file` (`{ path, maxBytes? }`; a text file also comes back as `text`). They are not screen input, so they run while a person holds the screen. One run can write a file and then open it on the screen.

## 0.4.1 (2026-10-10)

- `capsules.create` (and `launch`) sends an `Idempotency-Key` and asks again with it while the capsule is still being created (the API answers `202` with `status: "CREATING"`) or when a gateway or the network drops the request (502, 504, 520 to 524, no answer). It never asks again after a refusal such as no capacity, so it always gets the one capsule it launched. A cold-created Windows capsule takes minutes, longer than a gateway keeps a request open. `CreateCapsuleOptions.idempotencyKey` picks the key (to resume a launch from another process), `createTimeoutMs` changes the 15 minute limit; after it, the error names the key.
- `rollback` (on the handle and the `capsules` resource) restores the same way: a restore boots a clone and, on Windows, prepares its desktop, so it sends a key and asks again too (`idempotencyKey`, `createTimeoutMs`).
- Requests take per-call headers (`RequestOptions.headers`).
- `Capsule.sharedScreen`: the console shows the live shared screen, now on Windows desktops too (their VM screen, where the console used to be a separate RDP session).

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
