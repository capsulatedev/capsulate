import type { Command } from "commander";
import { withClient } from "./_shared.js";
import { result, success, table } from "../output.js";

export function registerVolumes(program: Command): void {
  const vol = program.command("volume").description("Manage persistent volumes");

  vol
    .command("create <name> <sizeGb>")
    .description("Create a persistent volume (GB)")
    .option("-r, --region <region>", "Region hint")
    .action((name: string, sizeGb: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ region?: string }>();
        const v = await client.volumes.create({ name, sizeGb: parseInt(sizeGb, 10), region: local.region });
        result(v, (d: any) => `✓ Volume ${d.id} "${d.name}" (${d.sizeGb} GB, home=${d.home ?? "?"})`);
      }),
    );

  vol
    .command("list")
    .description("List the team's volumes")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.volumes.list();
        result(list, (rows: any[]) =>
          table(
            rows.map((v) => ({ id: v.id, name: v.name, gb: v.sizeGb, home: v.home ?? "", status: v.status ?? "", attached: v.attachedTo ?? "" })),
            ["id", "name", "gb", "home", "status", "attached"],
          ),
        );
      }),
    );

  vol
    .command("get <id>")
    .description("Show a volume's details")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const v = await client.volumes.get(id);
        result(v, (d: any) => JSON.stringify(d, null, 2));
      }),
    );

  vol
    .command("delete <id>")
    .description("Delete a volume")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.volumes.delete(id);
        success(`Deleted volume ${id}`);
      }),
    );

  vol
    .command("attach <id> <capsuleId>")
    .description("Attach a volume to a capsule")
    .option("-m, --mount <path>", "Mount path")
    .option("--read-only", "Attach read-only")
    .action((id: string, capsuleId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ mount?: string; readOnly?: boolean }>();
        const r = await client.volumes.attach(capsuleId, id, { mountPath: local.mount, readOnly: local.readOnly });
        result(r, (d: any) => `✓ attached ${id} to ${capsuleId}${d.mountPath ? ` at ${d.mountPath}` : ""}`);
      }),
    );

  vol
    .command("detach <id> <capsuleId>")
    .description("Detach a volume from a capsule")
    .action((id: string, capsuleId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.volumes.detach(capsuleId, id);
        success(`Detached ${id} from ${capsuleId}`);
      }),
    );
}
