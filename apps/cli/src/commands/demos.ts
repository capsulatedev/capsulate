import type { Command } from "commander";
import { withClient } from "./_shared.js";
import { result, success, table } from "../output.js";

export function registerDemos(program: Command): void {
  const demo = program.command("demo").description("Path B — public demo links");

  demo
    .command("create <name>")
    .description("Create a public demo link from a template")
    .requiredOption("-t, --template <id>", "Template id (a desktop template is recommended)")
    .option("-s, --size <size>", "Resource size", "2c4g")
    .option("-p, --permission <perm>", "interactive | read-only", "interactive")
    .option("--ttl <minutes>", "Per-session TTL in minutes", (v) => parseInt(v, 10), 30)
    .option("--max <n>", "Max concurrent live sessions (0 = unlimited)", (v) => parseInt(v, 10), 0)
    .option("--require-email", "Collect visitor email before launch")
    .option("--record", "Record each demo session for replay")
    .action((name: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ template: string; size?: string; permission?: any; ttl?: number; max?: number; requireEmail?: boolean; record?: boolean }>();
        const d = await client.demos.create({
          name,
          templateId: o.template,
          size: o.size,
          permission: o.permission,
          ttlMinutes: o.ttl,
          maxConcurrent: o.max,
          requireEmail: o.requireEmail,
          record: o.record,
        });
        result(d, (x: any) => `✓ Demo link created: ${x.id}\n  Share: ${client.demos.url(x.id)}`);
      }),
    );

  demo
    .command("list")
    .description("List your team's demo links")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.demos.list();
        result(list, (rows: any[]) =>
          table(
            rows.map((d) => ({ id: d.id, name: d.name, template: d.templateId, active: d.active ? "yes" : "no", launches: d.launchCount })),
            ["id", "name", "template", "active", "launches"],
          ),
        );
      }),
    );

  demo
    .command("get <id>")
    .description("Show a demo link (incl. its public URL)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const d = await client.demos.get(id);
        result({ ...d, url: client.demos.url(d.id) });
      }),
    );

  demo
    .command("sessions <id>")
    .description("Show a demo link's visit analytics")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.demos.sessions(id);
        result(list, (rows: any[]) =>
          table(
            rows.map((s) => ({ visitor: s.visitorEmail || "anonymous", status: s.status, seconds: s.durationSeconds, started: (s.startedAt || "").slice(0, 19) })),
            ["visitor", "status", "seconds", "started"],
          ),
        );
      }),
    );

  demo
    .command("disable <id>")
    .description("Disable a demo link (its URL stops working)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.demos.update(id, { active: false });
        success(`Disabled demo ${id}`);
      }),
    );

  demo
    .command("enable <id>")
    .description("Re-enable a disabled demo link")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.demos.update(id, { active: true });
        success(`Enabled demo ${id}`);
      }),
    );

  demo
    .command("delete <id>")
    .description("Delete a demo link")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.demos.delete(id);
        success(`Deleted demo ${id}`);
      }),
    );
}
