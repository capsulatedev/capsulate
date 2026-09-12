import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { withClient } from "./_shared.js";
import { result, success, table } from "../output.js";

export function registerExtras(program: Command): void {
  // --- snapshots ---
  const snap = program.command("snapshot").description("Capture & restore capsule snapshots");
  snap
    .command("create <id>")
    .description("Capture a snapshot of a capsule (billed by stored delta)")
    .option("-n, --name <name>", "Snapshot name")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ name?: string }>();
        const s = await client.capsules.snapshots.create(id, local.name);
        result(s, (d: any) => `✓ Snapshot ${d.id} (${fmtBytes(d.sizeBytes)})`);
      }),
    );
  snap
    .command("list <id>")
    .description("List a capsule's snapshots")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.capsules.snapshots.list(id);
        result(list, (rows: any[]) =>
          table(
            rows.map((s) => ({ id: s.id, name: s.name ?? "", size: fmtBytes(s.sizeBytes), created: (s.createdAt ?? "").slice(0, 19) })),
            ["id", "name", "size", "created"],
          ),
        );
      }),
    );
  snap
    .command("delete <id> <snapshotId>")
    .description("Delete a snapshot")
    .action((id: string, snapshotId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.snapshots.delete(id, snapshotId);
        success(`Deleted snapshot ${snapshotId}`);
      }),
    );
  snap
    .command("restore <snapshotId>")
    .description("Launch a new capsule from a snapshot")
    .requiredOption("-t, --template <id>", "Base template id of the snapshot")
    .option("-s, --size <size>", "Resource size", "1c2g")
    .option("-w, --wait", "Wait until ACTIVE")
    .action((snapshotId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ template: string; size?: string; wait?: boolean }>();
        const opts = { template: local.template, size: local.size ?? "2c4g", snapshot: snapshotId };
        const c = local.wait ? await client.capsules.launch(opts) : await client.capsules.create(opts);
        result(c.data, (d: any) => `✓ Restored into ${d.sessionId} (${d.status})`);
      }),
    );

  // --- recordings ---
  const rec = program.command("record").description("Record & replay a desktop capsule");
  rec
    .command("start <id>")
    .description("Start an on-demand recording")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.recordings.start(id);
        result(r, () => `✓ recording started`);
      }),
    );
  rec
    .command("stop <id>")
    .description("Stop the active recording")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.recordings.stop(id);
        result(r, (d: any) => (d?.id ? `✓ saved recording ${d.id} (${fmtBytes(d.sizeBytes)})` : `✓ stopped (nothing captured)`));
      }),
    );
  rec
    .command("status <id>")
    .description("Show recording status")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.recordings.status(id);
        result(r, (d: any) => `recording: ${d.recording}${d.startedAt ? ` since ${d.startedAt}` : ""}`);
      }),
    );
  rec
    .command("list <id>")
    .description("List a capsule's recordings")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.capsules.recordings.list(id);
        result(list, (rows: any[]) =>
          table(rows.map((r) => ({ id: r.id, kind: r.kind ?? "", size: fmtBytes(r.sizeBytes), created: (r.createdAt ?? "").slice(0, 19) })), ["id", "kind", "size", "created"]),
        );
      }),
    );
  rec
    .command("download <id> <recordingId> <file>")
    .description("Download a recording to a file (mp4)")
    .action((id: string, recordingId: string, file: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const buf = await client.capsules.recordings.downloadBytes(id, recordingId);
        writeFileSync(file, Buffer.from(buf));
        success(`Downloaded ${recordingId} → ${file} (${fmtBytes(buf.byteLength)})`);
      }),
    );
  rec
    .command("all")
    .description("List ALL the team's recordings (capsule + demo replays)")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.recordings.list();
        result(list, (rows: any[]) =>
          table(
            rows.map((r) => ({ id: r.id, kind: r.kind, source: r.source === "demo" ? `demo:${r.demoName}` : r.sessionId.slice(0, 24), size: fmtBytes(r.bytes), created: (r.startedAt || "").slice(0, 19) })),
            ["id", "kind", "source", "size", "created"],
          ),
        );
      }),
    );
  rec
    .command("rm <recordingId>")
    .description("Delete a recording (frees its stored GB)")
    .action((recordingId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.recordings.delete(recordingId);
        success(`Deleted recording ${recordingId}`);
      }),
    );

  // --- sharing ---
  const share = program.command("share").description("Share a capsule with guests");
  share
    .command("create <id> <email>")
    .description("Create a share link for a guest")
    .option("-p, --permission <perm>", "read-only | interactive", "read-only")
    .action((id: string, email: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ permission?: any }>();
        const r = await client.sharing.share(id, [{ email, permission: local.permission ?? "read-only" }]);
        result(r, (rows: any[]) => rows.map((g) => `✓ ${g.email}: share ${g.shareId} (passkey ${g.passkey})`).join("\n"));
      }),
    );
  share
    .command("list <id>")
    .description("List a capsule's guests")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.sharing.guests(id);
        result(list, (rows: any[]) =>
          table(rows.map((g) => ({ id: g.id, email: g.guestEmail, permission: g.permission, status: g.status })), ["id", "email", "permission", "status"]),
        );
      }),
    );
  share
    .command("revoke <guestId>")
    .description("Revoke a guest's access")
    .action((guestId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.sharing.removeGuest(guestId);
        success(`Revoked guest ${guestId}`);
      }),
    );

  // --- ports ---
  const port = program.command("port").description("Forward capsule ports");
  port
    .command("forward <id> <localPort>")
    .description("Forward a port to a public endpoint")
    .option("-n, --name <name>", "Port name")
    .action((id: string, localPort: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ name?: string }>();
        const r = await client.ports.forward(id, parseInt(localPort, 10), local.name);
        result(r, (d: any) => `✓ ${d.privatePort} → public ${d.publicPort}`);
      }),
    );
  port
    .command("rm <id> <publicPort>")
    .description("Remove a port forward")
    .action((id: string, publicPort: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.ports.remove(id, parseInt(publicPort, 10));
        success(`Removed public port ${publicPort}`);
      }),
    );
}

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
