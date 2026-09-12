# @capsulate/mcp

The Capsulate [Model Context Protocol](https://modelcontextprotocol.io) server.
Give Claude Desktop, Cursor, Windsurf, Antigravity — any MCP client — the ability
to launch and drive isolated cloud sandboxes ("capsules").

## Setup

1. Create an API key in the Capsulate dashboard: **Settings → API & Keys**.
2. Add the server to your MCP client config.

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
| `capsulate_screenshot` | See a desktop capsule (returns an image) |
| `capsulate_click` / `capsulate_type` / `capsulate_key` | Computer-use |
| `capsulate_snapshot` | Snapshot a capsule |
| `capsulate_catalog` | Discover launchable templates & bundles |

## Try it

> "Spin up an `ubuntu-22.04-headless` capsule, run my test suite, and show me the output."

The model will call `capsulate_launch`, then `capsulate_exec`, and report back.
