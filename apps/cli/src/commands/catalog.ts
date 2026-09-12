import type { Command } from "commander";
import { withClient } from "./_shared.js";
import { result, table } from "../output.js";

export function registerCatalog(program: Command): void {
  program
    .command("catalog")
    .description("List launchable operating systems / base templates")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.catalog.list();
        result(list, (rows: any[]) =>
          table(rows.map((a) => ({ id: a.id, kind: a.kind ?? "", bucket: a.bucket ?? "", status: a.status ?? "" })), ["id", "kind", "bucket", "status"]),
        );
      }),
    );

  program
    .command("bundles")
    .description("List Bucket-B marketplace bundles with availability")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.bundles.list();
        result(list, (rows: any[]) =>
          table(
            rows.map((b) => ({ id: b.id, name: b.displayName ?? "", availability: b.availability ?? "", software: (b.software ?? []).join(",") })),
            ["id", "name", "availability", "software"],
          ),
        );
      }),
    );

  program
    .command("templates")
    .description("List your team's saved templates")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.templates.list();
        result(list, (rows: any[]) =>
          table(rows.map((t) => ({ id: t.id, name: t.name ?? "", home: t.home ?? "", created: (t.createdAt ?? "").slice(0, 19) })), ["id", "name", "home", "created"]),
        );
      }),
    );

  program
    .command("pricing")
    .description("Show the platform pricing table")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const p = await client.billing.pricing();
        result(p);
      }),
    );

  program
    .command("availability <templateId>")
    .description("Show launch availability (sizes/regions) for a template")
    .action((templateId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const a = await client.billing.availability(templateId);
        result(a);
      }),
    );
}
