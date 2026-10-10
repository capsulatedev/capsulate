# @capsulate/mcp

The Capsulate [Model Context Protocol](https://modelcontextprotocol.io) server.
Give Claude Code, Claude Desktop, Cursor, Windsurf, Antigravity, any MCP client, the ability
to launch and drive isolated cloud computers ("capsules"), including real Linux and Windows
desktops that a person can watch live and take over.

## Setup

1. Create an API key in the Capsulate dashboard: **Settings → API & Keys**.
2. Add the server to your MCP client config.

### Claude Code

```bash
claude mcp add capsulate -e CAPSULATE_API_KEY=cap_live_... -- npx -y @capsulate/mcp
```

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "capsulate": {
      "command": "npx",
      "args": ["-y", "@capsulate/mcp"],
      "env": {
        "CAPSULATE_API_KEY": "cap_live_…"
      }
    }
  }
}
```

To keep the key out of the config file, put it in a file and point at it with
`CAPSULATE_API_KEY_FILE` instead. The file holds either the bare key or a
`CAPSULATE_API_KEY=cap_live_...` line.

For a self-hosted or non-default deployment, also set
`"CAPSULATE_BASE_URL": "https://api.your-domain"`.

## Tools

| Tool | What it does |
| --- | --- |
| `capsulate_launch` | Launch a capsule and wait until ready |
| `capsulate_list` / `capsulate_get` | Inspect capsules |
| `capsulate_destroy` | Tear a capsule down |
| `capsulate_exec` | Run a command (argv array) |
| `capsulate_run_code` | Run a python/node/bash snippet |
| `capsulate_write_file` / `capsulate_read_file` | File I/O |
| `capsulate_set_env` | Set environment variables |
| `capsulate_snapshot` | Snapshot a capsule |
| `capsulate_catalog` | Discover launchable templates & bundles |

### Desktop computer use

| Tool | What it does |
| --- | --- |
| `capsulate_screenshot` | See the screen (returns an image; `format: "jpeg"`, a `scale` or a region make it smaller) |
| `capsulate_screen_info` | The screen's size, the pointer and the active window |
| `capsulate_click` / `capsulate_move` / `capsulate_drag` / `capsulate_scroll` | Pointer |
| `capsulate_type` / `capsulate_key` | Keyboard |
| `capsulate_ui_tree` | Read the accessibility tree (AT-SPI on Linux, UI Automation on Windows) with clickable centers |
| `capsulate_find_element` / `capsulate_wait_element` | Find or wait for an element by role, name or text |
| `capsulate_click_element` | Find an element and click it: the reliable way to press a named button |
| `capsulate_clipboard` | Read or set the clipboard (paste long text instead of typing it) |
| `capsulate_element` | Act on an element without coordinates: set its value, clear, toggle, expand or collapse, invoke, select an option by name, focus, scroll it into view |
| `capsulate_windows` | List windows or bring one to the front |
| `capsulate_window` | Minimize, maximize, restore, close, move or resize a window |
| `capsulate_open` | Open a URL, a file or an app by name, and wait for its window |
| `capsulate_wait_for` | Wait for an element to appear, go away, be enabled or show a text, for a window, or for the screen to settle |
| `capsulate_ocr` | Read the text on screen when the UI tree has no labels |
| `capsulate_run_actions` | Several steps in one call, back to back, stopping at the first that fails, with a look at the end |

The input verbs accept `screenshot: true` (and `screenshotDelayMs`) to return the frame after the action.
Every tool works the same on Linux and Windows desktops; a multi-line editor is a `document` on Windows
and a `text` on Linux.

### Browser fast path

The capsule's own Chrome, driven through the page's structure at page speed, on the same screen the
person watches: `capsulate_browser_open`, `_navigate`, `_tabs`, `_snapshot` (an outline with refs),
`_click`, `_fill` (the value is never echoed), `_select`, `_press`, `_scroll`, `_wait`, `_text`,
`_eval` and `_screenshot`.

### Live: a person watches, takes over, hands back

A desktop capsule has one shared screen. The AI drives it through the tools above while a person
watches the same screen in a browser, sees the AI's pointer, clicks and keys drawn over it, reads
its narration, and can take the screen at any time.

| Tool | What it does |
| --- | --- |
| `capsulate_console_link` | A signed, expiring URL that opens the live screen in any browser with no login (`control` or `view`) |
| `capsulate_say` | Show one line of narration on the live console |
| `capsulate_control` | Who is driving: `free`, `agent` (the AI) or `human`; `take` or `release` the screen; set the `pace` (`natural` or `presentation`) for a person watching |
| `capsulate_handoff` | Hand the screen to the person with a note ("Please sign in"), wait until they hand it back, get their note |
| `capsulate_wait_for_handback` | Keep waiting for the person to hand the screen back |

While a person holds the screen, the AI's input verbs answer `human_in_control` and nothing reaches
the capsule; the tool result says to wait with `capsulate_wait_for_handback`. Reading the screen
(screenshot, UI tree, OCR) keeps working. Each AI input holds the screen for 45 seconds; the
console is view-only for everyone else during that time and turns interactive again when the AI
goes quiet or releases.

## Try it

> "Spin up an `ubuntu-22.04-headless` capsule, run my test suite, and show me the output."

The model calls `capsulate_launch`, then `capsulate_exec`, and reports back.

> "Launch an `ubuntu-22.04-desktop` capsule, give me a live link, and find the latest Firefox release
> notes. If anything needs a login, hand it to me."

The model launches the desktop, calls `capsulate_console_link` and gives you the URL, narrates with
`capsulate_say` as it works, and calls `capsulate_handoff` when it needs you. You press
**Done, hand back** in the live console when you finish, and it carries on.

## Develop

```bash
npm run build                          # from the repo root: sdk, ai-tools, cli, mcp
node apps/mcp/scripts/smoke-live.mjs   # live tools end to end against a fake API
```
