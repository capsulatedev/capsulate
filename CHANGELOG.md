# Changelog

All four packages share a version.

## 0.6.0 (2026-10-12)

- Quick or careful: how carefully the AI checks its work is a setting on a capsule's screen. `quick` plans the whole job and runs it in as few runs as possible, looking at the screen only when it needs to; `careful` checks after every step; `balanced` is the default. `setCare` and `ControlStatus.care` in the SDK, `capsulate_control` action `care` (the MCP server's instructions say what each means), `cap control care <id> quick`.
- Drawing along a path: a drag can follow a list of `[x, y]` points, for curves, circles, signatures and any shape a hand draws. `smooth` draws a curve through the points, `closed` returns to the first one, `stepMs` is the pause between points. `stroke()` in the SDK, `capsulate_drag` with a `path` (and a new ai-tools `capsulate_drag`), `cap stroke <id> x,y x,y ...`.
- A run takes up to 200 steps (was 50).

## 0.5.0 (2026-10-11)

- Commands first, the screen when it matters. The MCP server's instructions now open with how to work: files, installs, settings, scripts and data through commands (one call, a fraction of a second), the screen for an app's own window, for what the person must see and for handoffs, and PowerShell on Windows. `@capsulate/ai-tools` exports the same guidance as `CAPSULATE_GUIDANCE` for your agent's system prompt. Measured on a Windows desktop: three files written and one shown on the screen took 0.7 s in one call, against 13 s and 21 calls through the editor.
- Visible mode: when the person wants to watch the whole task, the AI does every step on the screen. `setVisible` and `ControlStatus.visible` in the SDK, `capsulate_control` action `visible`, `cap control visible <id> on|off`.
- One run mixes commands and files with the screen: `runActions` takes `exec`, `write_file` and `read_file` steps (a text file comes back as `text`), so one call can write a file and open it. They are not screen input, so they run while a person holds the screen.
- PowerShell snippets: `run(code, { lang: "powershell" })`, `capsulate_run_code` with `lang: "powershell"`, `cap run --lang powershell`. The ai-tools `capsulate_exec` takes `cwd`.

## 0.4.1 (2026-10-10)

- Launches that wait: the SDK's `capsules.create` sends an `Idempotency-Key` and asks again with it while the capsule is still being created (the API answers `202` with `status: "CREATING"`) or when a gateway or the network drops the request, never after a refusal such as no capacity. A cold-created Windows desktop takes minutes, longer than a gateway keeps a request open; `cap launch`, `capsulate_launch` and the ai-tools launch now wait for it. `idempotencyKey` and `createTimeoutMs` on the create options; `rollback` restores the same way.
- Examples: `claude-code-live-handoff` (Claude Code drives a live desktop over MCP and hands you the screen) and `desktop-batch-form-fill` (a timed form fill in the capsule's own Chrome, then the editor in one `runActions` call, on Linux or Windows).

## 0.4.0 (2026-10-10)

- The complete computer-use toolset, the same on Linux and Windows desktops. Act on an element without coordinates: `elementAction` sets a value, clears, toggles, expands or collapses, invokes, selects (an option by name inside a combo box or list), focuses or scrolls it into view, with a `setValue` shortcut. `windowAction` minimizes, maximizes, restores, closes, moves and resizes windows. `open` opens a URL, a file or an app by name and can wait for its window. `waitFor` waits in the capsule for an element to appear, go away, be enabled or show a text, for a window, or for the screen to settle, without holding up other calls. `screenInfo` reads the screen size, the pointer and the active window. Screenshots can be JPEG, scaled or a region (about 42 KiB to 10 KiB for a 1280x800 screen). MCP: `capsulate_element`, `capsulate_window`, `capsulate_open`, `capsulate_wait_for`, `capsulate_screen_info`. CLI: `cap element`, `cap window`, `cap open`, `cap wait-for`, `cap screen`, and `cap shot --format --scale --region`. ai-tools: the same five tools.
- The browser fast path: the capsule's own Chrome driven through the page's structure at page speed, on the screen the person watches (`capsule.browser`, the thirteen `capsulate_browser_*` tools, `cap browser`).
- Several steps in one call, stopping at the first that fails, with per-step expectations and a look at the end: `runActions`, `capsulate_run_actions`, `cap actions`.
- A watched pace: `setPace("natural" | "presentation")` glides the pointer and slows typing for a person following along (`capsulate_control` action `pace`, `cap control pace`).
- `CapsulateError.code` gives the machine code of a refused call (`not_found`, `unsupported`, `human_in_control`). The SDK package no longer ships its compiled tests.

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
