import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { withClient, parseKeyVals } from "./_shared.js";
import { result, out, success, table, isJsonMode } from "../output.js";

function capsuleRow(c: any) {
  return {
    id: c.sessionId,
    status: c.status,
    template: c.templateId,
    size: c.size,
    region: c.region,
    created: c.createdAt ? String(c.createdAt).slice(0, 19).replace("T", " ") : "",
  };
}

export function registerCapsules(program: Command): void {
  // --- top-level convenience aliases ---
  program
    .command("launch")
    .description("Launch a new capsule (alias of `capsule create`)")
    .requiredOption("-t, --template <id>", "Template / OS / bundle id, e.g. ubuntu-22.04-headless")
    .option("-s, --size <size>", "Resource size", "1c2g")
    .option("-r, --region <region>", "Region hint (ISO-3166 alpha-2); omit for automatic")
    .option("-b, --bundle <id>", "Software bundle (Bucket B) to launch from")
    .option("--snapshot <id>", "Restore from a snapshot/template id")
    .option("--volume <id...>", "Persistent volume id(s) to attach")
    .option("-e, --env <KEY=VAL...>", "Environment variables to inject")
    .option("--on-start <script>", "Shell script to run once ACTIVE")
    .option("--record", "Start an on-demand desktop recording on launch")
    .option("-w, --wait", "Wait until the capsule is ACTIVE before returning")
    .action((_o, command: Command) => doLaunch(command));

  program
    .command("ls")
    .description("List active capsules (alias of `capsule list`)")
    .action((_o, command: Command) => doList(command));

  // --- capsule <verb> ---
  const cap = program.command("capsule").description("Manage capsules (sandboxes)");

  cap
    .command("create")
    .description("Launch a new capsule")
    .requiredOption("-t, --template <id>", "Template / OS / bundle id")
    .option("-s, --size <size>", "Resource size", "1c2g")
    .option("-r, --region <region>", "Region hint")
    .option("-b, --bundle <id>", "Software bundle id")
    .option("--snapshot <id>", "Restore from snapshot/template id")
    .option("--volume <id...>", "Volume id(s) to attach")
    .option("-e, --env <KEY=VAL...>", "Env vars")
    .option("--on-start <script>", "onStart script")
    .option("--record", "Record on launch")
    .option("-w, --wait", "Wait until ACTIVE")
    .action((_o, command: Command) => doLaunch(command));

  cap
    .command("list")
    .description("List active capsules")
    .action((_o, command: Command) => doList(command));

  cap
    .command("history")
    .description("List capsule history (includes destroyed)")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.capsules.history();
        result(list, (rows: any[]) => table(rows.map(capsuleRow), ["id", "status", "template", "size", "region", "created"]));
      }),
    );

  cap
    .command("get <id>")
    .description("Show a capsule's full details")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const c = await client.capsules.get(id);
        out(c.data);
      }),
    );

  cap
    .command("destroy <id>")
    .description("Terminate a capsule")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.destroy(id);
        success(`Destroyed ${id}`);
      }),
    );

  cap
    .command("suspend <id>")
    .description("Suspend (pause) a capsule")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.suspend(id);
        success(`Suspended ${id}`);
      }),
    );

  cap
    .command("resume <id>")
    .description("Resume a suspended capsule")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.resume(id);
        success(`Resumed ${id}`);
      }),
    );

  // --- interaction ---
  program
    .command("exec <id> [command...]")
    .description("Run a command in a capsule, e.g. cap exec sess-123 python3 -c \"print(42)\"")
    // The command may contain its own flags (e.g. `python3 -c`). Don't let commander
    // treat them as exec's options, and reconstruct the command from raw argv so it
    // works even when a shell/npm-shim strips the `--` separator (Windows PowerShell).
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--cwd <dir>", "Working directory (place before <id>)")
    .option("--timeout <sec>", "Timeout in seconds (place before <id>)", (v) => parseInt(v, 10))
    .option("--stdin <text>", "Pass text on stdin (place before <id>)")
    .action((id: string, cmdArg: string[], _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ cwd?: string; timeout?: number; stdin?: string }>();
        const cmd = rawExecCommand(id, cmdArg);
        if (cmd.length === 0) throw new Error('No command given. Try: cap exec <id> python3 -c "print(42)"');
        const r = await client.capsules.exec(id, cmd, {
          cwd: local.cwd,
          timeoutSec: local.timeout,
          stdin: local.stdin,
        });
        if (isJsonMode()) {
          out(r);
        } else {
          if (r.stdout) process.stdout.write(r.stdout);
          if (r.stderr) process.stderr.write(r.stderr);
          if (r.exitCode) process.exitCode = r.exitCode;
        }
      }),
    );

  program
    .command("run <id> <code>")
    .description("Run a snippet of code in a capsule")
    .option("-l, --lang <lang>", "python | node | bash", "bash")
    .option("--timeout <sec>", "Timeout in seconds", (v) => parseInt(v, 10))
    .action((id: string, code: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ lang?: any; timeout?: number }>();
        const r = await client.capsules.run(id, code, { lang: local.lang, timeoutSec: local.timeout });
        if (isJsonMode()) out(r);
        else {
          if (r.stdout) process.stdout.write(r.stdout);
          if (r.stderr) process.stderr.write(r.stderr);
          if (r.exitCode) process.exitCode = r.exitCode;
        }
      }),
    );

  program
    .command("cp <src> <dst>")
    .description("Copy a file to/from a capsule. Use ID:PATH for the remote side.")
    .action((src: string, dst: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const srcRemote = parseRemote(src);
        const dstRemote = parseRemote(dst);
        if (srcRemote && dstRemote) throw new Error("Only one side may be remote (ID:PATH).");
        if (!srcRemote && !dstRemote) throw new Error("One side must be remote (ID:PATH).");
        if (dstRemote) {
          // local -> capsule
          const content = readFileSync(src);
          await client.capsules.writeFile(dstRemote.id, dstRemote.path, new Uint8Array(content));
          success(`Uploaded ${src} → ${dstRemote.id}:${dstRemote.path}`);
        } else if (srcRemote) {
          // capsule -> local
          const res = await client.capsules.readFile(srcRemote.id, srcRemote.path);
          const bytes = Buffer.from(res.contentB64 ?? "", "base64");
          if (dst === "-") process.stdout.write(bytes);
          else {
            writeFileSync(dst, bytes);
            success(`Downloaded ${srcRemote.id}:${srcRemote.path} → ${dst}`);
          }
        }
      }),
    );

  const env = program.command("env").description("Manage capsule environment variables");
  env
    .command("set <id> <KEY=VAL...>")
    .description("Set environment variables in a running capsule")
    .option("--secret", "Mark values as secret")
    .action((id: string, pairs: string[], _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ secret?: boolean }>();
        const vars = parseKeyVals(pairs);
        const r = await client.capsules.setEnv(id, vars, local.secret);
        result(r, () => `✓ Set ${Object.keys(vars).length} variable(s) in ${id}`);
      }),
    );
}

/**
 * Reconstruct the exec command from the raw process argv, starting after the <id>.
 * This preserves flags inside the command (e.g. `python3 -c "…"`) that commander would
 * otherwise reject as unknown options, and tolerates a `--` separator being kept OR
 * stripped (npm shims on Windows/PowerShell drop it). Falls back to commander's parsed
 * variadic if the id can't be located in argv.
 */
function rawExecCommand(id: string, fallback: string[]): string[] {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(id);
  if (idx === -1) return (fallback ?? []).filter((t) => t !== "--");
  let rest = argv.slice(idx + 1);
  if (rest[0] === "--") rest = rest.slice(1); // drop an end-of-options marker if present
  return rest;
}

function parseRemote(s: string): { id: string; path: string } | null {
  // ID:PATH where ID looks like a session id (no leading drive letter like C:\).
  const idx = s.indexOf(":");
  if (idx <= 1) return null; // avoid Windows drive letters "C:\..."
  const id = s.slice(0, idx);
  const path = s.slice(idx + 1);
  if (!path.startsWith("/")) return null; // remote paths are absolute
  return { id, path };
}

async function doLaunch(command: Command): Promise<void> {
  await withClient(command, async (client) => {
    const o = command.opts<{
      template: string;
      size?: string;
      region?: string;
      bundle?: string;
      snapshot?: string;
      volume?: string[];
      env?: string[];
      onStart?: string;
      record?: boolean;
      wait?: boolean;
    }>();
    const opts = {
      template: o.template,
      size: o.size ?? "1c2g",
      region: o.region,
      bundle: o.bundle,
      snapshot: o.snapshot,
      volumes: o.volume,
      env: o.env ? parseKeyVals(o.env) : undefined,
      onStart: o.onStart,
      record: o.record,
    };
    const c = o.wait ? await client.capsules.launch(opts) : await client.capsules.create(opts);
    result(
      c.data,
      (d: any) =>
        `✓ ${o.wait ? "Capsule ready" : "Capsule launched"}: ${d.sessionId} (${d.status})\n` +
        `  template ${d.templateId}  size ${d.size}  region ${d.region ?? "auto"}`,
    );
  });
}

async function doList(command: Command): Promise<void> {
  await withClient(command, async (client) => {
    const list = await client.capsules.list();
    result(list, (rows: any[]) =>
      table(rows.map(capsuleRow), ["id", "status", "template", "size", "region", "created"]),
    );
  });
}
