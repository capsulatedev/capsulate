# Capsulate

Real computers for AI agents. A capsule is a full KVM virtual machine, Linux headless, Linux desktop, or Windows Server desktop for invited testers, taken from a warm pool in about two seconds. Your agent gets exec, files, screenshots, the OS accessibility tree (AT-SPI on Linux, UIAutomation on Windows), checkpoint and rollback of the whole machine, and session replay.

This repository is the doorway: everything a developer installs to talk to Capsulate. It is MIT licensed. The engine (the control plane and the node agent) runs on our metal in Helsinki and is not in this repository.

| Package | What it is | Install |
|---|---|---|
| [`@capsulate/sdk`](packages/sdk) | TypeScript client, zero dependencies | `npm i @capsulate/sdk` |
| [`@capsulate/cli`](apps/cli) | The `cap` command line | `npm i -g @capsulate/cli` |
| [`@capsulate/mcp`](apps/mcp) | MCP server for Claude Desktop, Cursor and any MCP client | `npx -y @capsulate/mcp` |
| [`@capsulate/ai-tools`](packages/ai-tools) | Tool packs for the Vercel AI SDK and LangChain | `npm i @capsulate/ai-tools` |
| [`run-action`](integrations/github-action) | GitHub Action: run a step inside a capsule | `uses: capsulatedev/run-action@v1` |

## Quickstart

You need an API key from the dashboard (Settings, API and Keys). Capsulate is in a private beta; request access at [capsulate.dev](https://capsulate.dev).

```bash
npm i -g @capsulate/cli
cap login --api-key cap_live_...
cap launch -t ubuntu-desktop -s 1c2g --wait
cap exec <id> -- python3 -c "print(6 * 7)"
cap shot <id> -o frame.png
cap capsule destroy <id>
```

Or from TypeScript:

```ts
import { Capsulate } from "@capsulate/sdk";

const cap = new Capsulate({ apiKey: process.env.CAPSULATE_API_KEY });
const box = await cap.capsules.launch({ template: "ubuntu-desktop", size: "1c2g" });
await box.waitUntilActive();
await box.exec(["python3", "main.py"]);
await box.findAndClick({ name: "Save" });        // find the control by name, act, verify
const cp = await box.checkpoint("before-submit"); // whole machine, under a second
await box.destroy();
```

More in [`examples/`](examples) and at [docs.capsulate.dev](https://docs.capsulate.dev).

## Sizes and pricing

Machines are metered per second. The beta is free; the published rates are on the [pricing page](https://docs.capsulate.dev/pricing). Limits and known issues are listed honestly at [docs.capsulate.dev/limits](https://docs.capsulate.dev/limits): one compute node in Helsinki today, about ten to fifteen capsules active at the same time, Windows for invited testers only.

## Developing

```bash
npm ci
npm run build:sdk    # the CLI, MCP server and tool packs typecheck against the built SDK types
npm run typecheck
npm run build
```

`npm run build` builds the SDK first, then the tool packs, the CLI and the MCP server.

## Security

Report vulnerabilities to security@capsulate.dev (see [SECURITY.md](SECURITY.md)). Never put a real `cap_live_` key in an issue.

## License

MIT. Copyright 2026 Milad Djahandide.
