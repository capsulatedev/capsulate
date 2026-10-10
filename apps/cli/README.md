# cap — the Capsulate CLI

Launch and drive isolated cloud sandboxes ("capsules") from your terminal. Full
parity with the Capsulate dashboard and API.

## Install

```bash
npm install -g @capsulate/cli
```

## Authenticate

```bash
# Recommended for agents / CI — paste an API key from the dashboard (Settings → API & Keys):
cap login --api-key cap_live_xxx

# Or log in interactively (for team / billing administration):
cap login --email you@example.com
```

Credentials live in `~/.capsulate/config.json`. You can also use env vars
(`CAPSULATE_API_KEY`, `CAPSULATE_BASE_URL`, `CAPSULATE_TEAM_ID`) or global flags
(`--api-key`, `--base-url`, `--team`, `--json`).

## Common commands

```bash
cap launch -t ubuntu-22.04-headless -s 2c4g --wait   # launch + wait for ACTIVE
cap ls                                                # list active capsules
cap exec <id> python3 -c "print(42)"               # run a command
cap run <id> "print(40+2)" --lang python              # run a snippet
cap cp ./app.py <id>:/workspace/app.py                # upload a file
cap cp <id>:/workspace/out.txt ./out.txt              # download a file
cap env set <id> NODE_ENV=production                   # set env vars
cap shot <id> -o frame.png                            # desktop screenshot
cap shot <id> --format jpeg --scale 0.5 -o small.jpg  # a smaller one
cap click <id> 100 200                                # computer-use
cap element <id> set_value --role text --value hello  # act on an element, no coordinates
cap open <id> notepad --wait-ms 8000                  # open an app and wait for its window
cap wait-for <id> absent --role dialog                # wait instead of sleeping
cap actions <id> @steps.json --observe screenshot     # several steps in one call
cap snapshot create <id> -n before-upgrade            # snapshot
cap volume create data 10                             # 10 GB persistent volume
cap share create <id> teammate@x.com -p interactive   # share a capsule
cap capsule destroy <id>                              # tear down
```

Add `--json` to any command for machine-readable output. Run `cap <command> --help`
for the full option list, or `cap docs` to open the documentation.

## Full command map

| Area | Commands |
| --- | --- |
| Auth | `login`, `configure`, `whoami`, `logout` |
| Capsules | `launch`, `ls`, `capsule create/list/history/get/destroy/suspend/resume` |
| Interaction | `exec`, `run`, `cp`, `env set` |
| Computer-use | `shot`, `screen`, `click`, `move`, `scroll`, `drag`, `type`, `key`, `ui-tree`, `find`, `wait`, `wait-for`, `element`, `window`, `windows`, `focus`, `open`, `clipboard`, `ocr`, `trace`, `actions` |
| Browser | `browser <id> <verb>` (open, navigate, tabs, snapshot, click, fill, select, press, scroll, wait, text, eval, screenshot) |
| Live | `live`, `control` (take, release, pace), `handoff`, `say` |
| Snapshots | `snapshot create/list/delete/restore` |
| Recordings | `record start/stop/status/list/download` |
| Volumes | `volume create/list/get/delete/attach/detach` |
| Sharing | `share create/list/revoke`, `port forward/rm` |
| Catalog | `catalog`, `bundles`, `templates`, `pricing`, `availability` |
| Account | `team list/members`, `billing balance`, `apikey list/create/revoke` |
