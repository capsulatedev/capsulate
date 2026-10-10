# Changelog

`@capsulate/cli` (the `cap` command). The four doorway packages (sdk, cli, mcp, ai-tools) share a version.

## 0.4.1 (2026-10-10)

- `cap launch` waits for a long launch: a Windows desktop that is cold-created takes minutes, and the SDK 0.4.1 under the CLI keeps asking for it with the same key instead of failing at the gateway's 100 s.

## 0.4.0 (2026-10-10)

- The complete toolset: `cap element <id> <action>` (set_value, toggle, expand, invoke, select, ... by `--role`, `--name`, `--text`), `cap window <id> <action>` (by `--title` or `--id`), `cap open <id> <target>` (`--wait-ms`), `cap wait-for <id> <condition>` (exit code 1 when it does not hold) and `cap screen <id>`.
- `cap shot` takes `--format jpeg`, `--quality`, `--scale` and `--region x,y,w,h`.
- `cap control pace <id> <fast|natural|presentation>`.
- `cap browser <id> <verb> [fields]`: the browser fast path (snapshot prints the outline, `screenshot -o` saves the image).
- `cap actions <id> <steps>`: several steps in one call, from a JSON list, `@file` or `-` (stdin); `--observe screenshot -o after.png`; exit code 1 when the run stops early.

## 0.3.0 (2026-10-09)

- Live computer use: `cap live <id>` opens the live screen (a signed link; `--view`, `--ttl`, `--no-open`), `cap live revoke <id>`, `cap control <id>` (who is driving), `cap control take|release|wait <id>`, `cap handoff <id> <note>` (waits for Done, hand back) and `cap say <id> <text>`.
- Depends on `@capsulate/sdk` ^0.3.0.
- Login: `cap login` with no flags asks you to paste an API key, or press Enter to sign in in the browser. `cap login --web` opens `app.capsulate.dev/cli-auth?code=XXXX-XXXX`; approve the code there and the CLI receives a key. `cap login --api-key <key>` and `cap login --email <email>` are unchanged; `cap whoami` and `cap logout` as before.
- Computer-use from the terminal (desktop templates), 12 new commands: `cap ui-tree <id> [--depth n]`, `cap find <id> --role <r> --name <n>` (or `--text`), `cap wait <id> --name <n> [--role r] [--timeout ms]`, `cap clipboard get <id>`, `cap clipboard set <id> <text>`, `cap windows <id>`, `cap focus <id> --title <t>`, `cap ocr <id> [--region x,y,w,h]`, `cap trace <id>`, `cap checkpoint <id> [--name]`, `cap checkpoint list <id>`, `cap rollback <id> <checkpointId>`.

## 0.2.0 (2026-09-12)

- `-s/--shot`, `--shot-delay` and `--shot-out` on `click`, `move`, `scroll`, `drag`, `type` and `key`; default size is now `1c2g`.
- Repository moved to `github.com/capsulatedev/capsulate`.

## 0.1.0 (2026-06-18)

- First public release of `@capsulate/sdk`, `@capsulate/cli`, `@capsulate/mcp` and `@capsulate/ai-tools`.
