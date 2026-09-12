#!/usr/bin/env node
// cap — the Capsulate CLI. Launch and drive cloud sandboxes (capsules) from your
// terminal, with full parity to the dashboard and API.
//
//   cap login --api-key cap_live_...
//   cap launch -t ubuntu-22.04-headless -s 2c4g --wait
//   cap exec <id> -- python3 -c "print(42)"
//   cap shot <id> -o frame.png
//
// All credentials, base URL, and team can be set via `cap login`/`cap configure`,
// the CAPSULATE_* env vars, or the global flags below.

import { Command } from "commander";
import { cliVersion } from "./client.js";
import { loadConfig, DEFAULT_BASE_URL } from "./config.js";
import { maybeNotifyUpdate } from "./versionNotice.js";
import { registerAuth } from "./commands/auth.js";
import { registerCapsules } from "./commands/capsules.js";
import { registerComputerUse } from "./commands/computeruse.js";
import { registerExtras } from "./commands/extras.js";
import { registerVolumes } from "./commands/volumes.js";
import { registerCatalog } from "./commands/catalog.js";
import { registerAccount } from "./commands/account.js";
import { registerDemos } from "./commands/demos.js";

const program = new Command();

program
  .name("cap")
  .description("Capsulate CLI — isolated cloud sandboxes for agents & developers")
  .version(cliVersion(), "-v, --version")
  .option("--json", "Output raw JSON (for scripting)")
  .option("--api-key <key>", "API key (overrides config/env)")
  .option("--token <jwt>", "Access token (overrides config/env)")
  .option("--base-url <url>", "API base URL (overrides config/env)")
  .option("--team <id>", "Team id (overrides config/env)")
  .configureHelp({ sortSubcommands: true });

registerAuth(program);
registerCapsules(program);
registerComputerUse(program);
registerExtras(program);
registerVolumes(program);
registerCatalog(program);
registerAccount(program);
registerDemos(program);

program.addHelpText(
  "after",
  `
Examples:
  $ cap login --api-key cap_live_xxx
  $ cap launch -t ubuntu-22.04-headless -s 2c4g --wait
  $ cap exec sess-abc ls -la /workspace
  $ cap run sess-abc "print(40+2)" --lang python
  $ cap cp ./app.py sess-abc:/workspace/app.py
  $ cap shot sess-abc -o frame.png
  $ cap snapshot create sess-abc -n "before-upgrade"
  $ cap volume create data 10
  $ cap capsule destroy sess-abc

Docs: https://docs.capsulate.dev   ·   cap <command> --help for details
`,
);

program
  .parseAsync(process.argv)
  .then(async () => {
    // 12R-14: best-effort outdated-client nudge (throttled, never blocks/affects exit).
    const o = program.opts();
    const baseUrl = o.baseUrl || process.env.CAPSULATE_BASE_URL || loadConfig().baseUrl || DEFAULT_BASE_URL;
    await maybeNotifyUpdate(baseUrl, !!o.json);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
