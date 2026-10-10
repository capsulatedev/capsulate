# Changelog

All four packages share a version.

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
