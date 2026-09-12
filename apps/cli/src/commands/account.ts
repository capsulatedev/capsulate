import type { Command } from "commander";
import { withClient } from "./_shared.js";
import { result, success, table, out } from "../output.js";

const DOCS_URL = process.env.CAPSULATE_DOCS_URL || "https://docs.capsulate.dev";

export function registerAccount(program: Command): void {
  const team = program.command("team").description("Teams");
  team
    .command("list")
    .description("List your teams")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.teams.list();
        result(list, (rows: any[]) => table(rows.map((t) => ({ id: t.id, name: t.name ?? "", role: t.role ?? "" })), ["id", "name", "role"]));
      }),
    );
  team
    .command("members")
    .description("List members of the current team")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.teams.members();
        out(list);
      }),
    );

  const billing = program.command("billing").description("Billing & credits");
  billing
    .command("balance")
    .description("Show the team's credit balance")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const b = await client.billing.balance();
        result(b, (d: any) => `Credits: ${d.totalCredits}`);
      }),
    );

  const apikey = program.command("apikey").description("Manage API keys");
  apikey
    .command("list")
    .description("List the team's API keys")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.apiKeys.list();
        result(list, (rows: any[]) =>
          table(
            rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: (k.scopes ?? []).join(","), revoked: k.revokedAt ? "yes" : "" })),
            ["id", "name", "prefix", "scopes", "revoked"],
          ),
        );
      }),
    );
  apikey
    .command("create <name>")
    .description("Create an API key (the key is shown once)")
    .option(
      "-s, --scope <scope...>",
      "Scopes",
      ["capsule:create", "capsule:read", "capsule:exec", "capsule:destroy"],
    )
    .option("--spend-cap <credits>", "Spend cap in credits", (v) => parseInt(v, 10))
    .action((name: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ scope?: string[]; spendCap?: number }>();
        const created = await client.apiKeys.create({
          name,
          scopes: local.scope ?? ["capsule:create", "capsule:read", "capsule:exec", "capsule:destroy"],
          spendCapCredits: local.spendCap,
        });
        result(
          created,
          (d: any) =>
            `✓ Created API key "${d.apiKey?.name}"\n\n  ${d.key}\n\n  Save this now — it will not be shown again.`,
        );
      }),
    );
  apikey
    .command("revoke <keyId>")
    .description("Revoke an API key")
    .action((keyId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.apiKeys.revoke(keyId);
        success(`Revoked key ${keyId}`);
      }),
    );

  program
    .command("docs")
    .description("Open the Capsulate documentation in your browser")
    .action(async () => {
      success(`Documentation: ${DOCS_URL}`);
      await openUrl(DOCS_URL);
    });
}

async function openUrl(url: string): Promise<void> {
  try {
    const { spawn } = await import("node:child_process");
    const platform = process.platform;
    const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* best-effort */
  }
}
