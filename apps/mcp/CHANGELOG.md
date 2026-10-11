# Changelog

`@capsulate/mcp`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## 0.5.0 (2026-10-11)

- The server's instructions open with how to work: commands first (files, installs, settings, scripts and data through `capsulate_exec`, `capsulate_write_file`, `capsulate_read_file` and `capsulate_run_code`), the screen for an app's own window, for what the person must see and for handoffs, PowerShell on Windows, and visible mode.
- `capsulate_control` action `visible` turns visible mode on or off; the status says `visible: true` while the person wants to watch every step.
- `capsulate_run_code` takes `lang: "powershell"`; `capsulate_run_actions` takes `exec`, `write_file` and `read_file` steps; the exec, file and run_code descriptions say when they are the faster route.

## 0.4.1 (2026-10-10)

- `capsulate_launch` waits for a long launch the same way (the SDK 0.4.1 asks again with the same key), so a cold Windows desktop no longer fails at the gateway's 100 s.

## 0.4.0 (2026-10-10)

- The complete toolset, the same on Linux and Windows desktops: `capsulate_element` (set_value, clear, toggle, expand, collapse, invoke, select an option by name, focus, scroll_into_view, without coordinates), `capsulate_window` (minimize, maximize, restore, close, move, resize, focus), `capsulate_open` (a URL, a file or an app by name, waiting for its window), `capsulate_wait_for` (present, absent, enabled, text, window, screen_stable) and `capsulate_screen_info`. An action that could not happen answers "Not done" with its code and the next step to try.
- `capsulate_screenshot` takes `format` (`jpeg`), `quality`, `scale` and a region; the text after the image says how its points map back to the screen. `capsulate_run_actions` knows the new steps.
- `capsulate_control` action `pace` (`fast`, `natural`, `presentation`).
- The browser fast path: thirteen `capsulate_browser_*` tools. The snapshot comes back as compact lines (`[e12] link "Pricing"`), fill never echoes the value, the screenshot is a JPEG image.
- `capsulate_run_actions`: several steps in one call, with one readable line per step, where and why a run stopped, and the `observe` screenshot as an image. The server instructions point known next steps at it.

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
