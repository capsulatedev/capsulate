# mcp-claude-desktop

## What it does

Wires the Capsulate MCP server into an MCP client, so the assistant you already use can launch
a capsule, run commands in it, move files in and out, drive a desktop, snapshot it, and destroy
it. No code to write: one config file and a restart.

`claude_desktop_config.json` in this folder is the whole thing. The server is published on npm
as `@capsulate/mcp` and listed in the MCP registry as `io.github.capsulatedev/capsulate`.

## Install it

Copy the contents of `claude_desktop_config.json` into your client's MCP config, replace the
key, and restart the client.

- Claude Desktop, macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop, Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Cursor: Settings, MCP, add a server with the same `command`, `args` and `env`.

Optional environment variables:

- `CAPSULATE_BASE_URL` points at another origin. The default is `https://api.capsulate.dev`.
- `CAPSULATE_TEAM_ID` pins a team. By default the key's own team is used.

## Check it works

Ask the assistant: "Launch an ubuntu-22.04-headless capsule at size 1c2g, run `uname -a` in it,
tell me the output, then destroy it." You should see it call `capsulate_launch`, `capsulate_exec`
and `capsulate_destroy`.

The tools it gets: `capsulate_launch`, `capsulate_list`, `capsulate_get`, `capsulate_destroy`,
`capsulate_exec`, `capsulate_run_code`, `capsulate_write_file`, `capsulate_read_file`,
`capsulate_set_env`, `capsulate_screenshot`, `capsulate_click`, `capsulate_type`,
`capsulate_key`, `capsulate_snapshot`, `capsulate_catalog`.

## Expected time

About 5 minutes to set up, most of it finding the config file. The first `npx -y @capsulate/mcp`
downloads the package, which takes a few seconds; after that the server starts instantly.

## Expected cost

Setting it up costs nothing. What the assistant then does costs whatever the capsules it opens
cost, at size `1c2g` (Micro) 0.2 credits per minute:

```
0.2 credits/minute x 10 minutes of a conversation with a capsule open = 2 credits = 0.02 USD
```

The risk here is not the rate, it is a capsule left running. Tell the assistant to destroy the
capsule when it is done, and check with `npx @capsulate/cli capsule list` if you are not sure.
Free accounts are capped at one capsule at a time and 60 minutes of lifetime, which is a
backstop, not a plan.

## Screenshots and computer use

`capsulate_screenshot`, `capsulate_click`, `capsulate_type` and `capsulate_key` need a desktop
template, so ask for `ubuntu-22.04-desktop`. On a headless capsule they answer `409`.
