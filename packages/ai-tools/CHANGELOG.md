# Changelog

`@capsulate/ai-tools`. The four doorway packages (sdk, cli, mcp, ai-tools) share a version again from 0.3.0 (0.2.1 was never published; its changes ship in 0.3.0).

## 0.6.0 (2026-10-12)

- A `capsulate_drag` tool: from one point to another, or along a path of `[x, y]` points (`smooth`, `closed`, `stepMs`, `button`).
- `capsulate_control` takes action `care` (`quick`, `balanced`, `careful`), and `CAPSULATE_GUIDANCE` says what quick and careful mean; `capsulate_run_actions` takes 200 steps.

## 0.5.0 (2026-10-11)

- `CAPSULATE_GUIDANCE`: how to work in a capsule (commands first, the screen when it matters, PowerShell on Windows, visible mode), for your agent's system prompt next to the tools. The Capsulate MCP server gives its clients the same guidance.
- The tool descriptions say when a command or a file is the faster route; `capsulate_exec` takes `cwd`, `capsulate_run_code` takes `lang: "powershell"`, `capsulate_control` takes action `visible`, and `capsulate_run_actions` takes `exec`, `write_file` and `read_file` steps.

## 0.4.1 (2026-10-10)

- `capsulate_launch` waits for a long launch through the SDK 0.4.1 (the same key until the capsule is ready).

## 0.4.0 (2026-10-10)

- The complete toolset: `capsulate_element`, `capsulate_window`, `capsulate_open`, `capsulate_wait_for` and `capsulate_screen_info`; an action that could not happen answers `{ ok: false, error, message }`.
- `capsulate_screenshot` takes `format`, `quality`, `scale` and a region, and returns `scale` and `region`.
- `capsulate_control` action `pace`.
- Browser tools: `capsulate_browser_open`, `_snapshot`, `_click`, `_fill`, `_wait`, `_text`.
- `capsulate_run_actions`: several steps in one call.

## 0.3.0 (2026-10-09)

- Live computer use: `capsulate_console_link`, `capsulate_say`, `capsulate_handoff` (waits for the hand back) and `capsulate_control`; 23 tools. `capsulate_press_keys` documents `+`-joined chords. Needs `@capsulate/sdk` 0.3.
- Vercel AI SDK v5: every tool now carries its zod schema as `inputSchema` next to the v4 name `parameters`, so `capsulateTools()` plugs into `generateText` on v4 (`maxSteps`) and v5 (`stopWhen: stepCountIs(n)`) unchanged. `ToolSpec` gained the `inputSchema` field; `CapsulateTool` is the exported per-tool type.
- `ai` declared as an optional peer dependency (`>=4.0.0`).
- README: v5 usage, a computer-use example, and the full tool list with one line each.

## 0.2.0 (2026-09-12)

- 19 tools (was 7), adding `screenshot`, `ui_tree`, `find_element`, `click_element`, `type_text`, `press_keys`, `wait_element`, `ocr`, `clipboard`, `checkpoint`, `rollback`, `get_trace`.
- Repository moved to `github.com/capsulatedev/capsulate`.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
