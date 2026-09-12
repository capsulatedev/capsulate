import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { withClient } from "./_shared.js";
import { result, success, info, out, isJsonMode } from "../output.js";

// Shared --shot flags: capture a screenshot after an input verb (act→observe in one call).
type ShotOpts = { shot?: boolean; shotDelay?: number; shotOut?: string };

function withShotOptions(cmd: Command): Command {
  return cmd
    .option("-s, --shot", "Capture a screenshot after the action and return it")
    .option("--shot-delay <ms>", "Settle delay (ms) before that screenshot (max 10000)", (v) => parseInt(v, 10))
    .option("--shot-out <file>", "Save the post-action screenshot PNG to this file");
}

function shotArgs(o: ShotOpts): { screenshot?: boolean; screenshotDelayMs?: number } {
  return { screenshot: o.shot, screenshotDelayMs: o.shotDelay };
}

function emitShot(
  r: { screenshot?: { imageB64?: string; width?: number; height?: number } },
  o: ShotOpts,
): void {
  if (!o.shot || !r.screenshot?.imageB64) return;
  const dims = `${r.screenshot.width ?? "?"}x${r.screenshot.height ?? "?"}`;
  if (o.shotOut) {
    writeFileSync(o.shotOut, Buffer.from(r.screenshot.imageB64, "base64"));
    success(`Saved post-action screenshot to ${o.shotOut} (${dims})`);
  } else {
    info(`(captured post-action screenshot ${dims}; base64 is in --json output)`);
  }
}

export function registerComputerUse(program: Command): void {
  program
    .command("shot <id>")
    .description("Capture a desktop screenshot (computer-use)")
    .option("-o, --out <file>", "Save the PNG to a file instead of printing base64")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ out?: string }>();
        const s = await client.capsules.screenshot(id);
        if (local.out) {
          writeFileSync(local.out, Buffer.from(s.imageB64 ?? "", "base64"));
          success(`Saved screenshot to ${local.out} (${s.width ?? "?"}x${s.height ?? "?"})`);
        } else if (isJsonMode()) {
          out(s);
        } else {
          process.stdout.write((s.imageB64 ?? "") + "\n");
        }
      }),
    );

  withShotOptions(
    program
      .command("click <id> <x> <y>")
      .description("Click at (x,y) (computer-use)")
      .option("-b, --button <button>", "left | right | middle", "left")
      .option("-c, --count <n>", "Click count (2 = double)", (v) => parseInt(v, 10), 1),
  ).action((id: string, x: string, y: string, _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<{ button?: any; count?: number } & ShotOpts>();
      const r = await client.capsules.click(id, num(x), num(y), {
        button: local.button,
        count: local.count,
        ...shotArgs(local),
      });
      result(r, () => `✓ clicked ${local.button ?? "left"} at (${x},${y})`);
      emitShot(r, local);
    }),
  );

  withShotOptions(
    program.command("move <id> <x> <y>").description("Move the cursor to (x,y)"),
  ).action((id: string, x: string, y: string, _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<ShotOpts>();
      const r = await client.capsules.move(id, num(x), num(y), shotArgs(local));
      result(r, () => `✓ moved to (${x},${y})`);
      emitShot(r, local);
    }),
  );

  withShotOptions(
    program.command("scroll <id> <x> <y> <dx> <dy>").description("Scroll by (dx,dy) at (x,y)"),
  ).action((id: string, x: string, y: string, dx: string, dy: string, _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<ShotOpts>();
      const r = await client.capsules.scroll(id, num(x), num(y), num(dx), num(dy), shotArgs(local));
      result(r, () => `✓ scrolled (${dx},${dy})`);
      emitShot(r, local);
    }),
  );

  withShotOptions(
    program
      .command("drag <id> <x1> <y1> <x2> <y2>")
      .description("Drag from (x1,y1) to (x2,y2)")
      .option("-b, --button <button>", "left | right | middle", "left"),
  ).action((id: string, x1: string, y1: string, x2: string, y2: string, _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<{ button?: any } & ShotOpts>();
      const r = await client.capsules.drag(id, num(x1), num(y1), num(x2), num(y2), local.button, shotArgs(local));
      result(r, () => `✓ dragged (${x1},${y1})→(${x2},${y2})`);
      emitShot(r, local);
    }),
  );

  withShotOptions(
    program.command("type <id> <text>").description("Type text (computer-use)"),
  ).action((id: string, text: string, _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<ShotOpts>();
      const r = await client.capsules.type(id, text, shotArgs(local));
      result(r, () => `✓ typed ${text.length} chars`);
      emitShot(r, local);
    }),
  );

  withShotOptions(
    program
      .command("key <id> <keys...>")
      .description("Press key(s) / chord, e.g. cap key sess-123 ctrl c"),
  ).action((id: string, keys: string[], _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<ShotOpts>();
      const r = await client.capsules.key(id, keys, shotArgs(local));
      result(r, () => `✓ pressed ${keys.join("+")}`);
      emitShot(r, local);
    }),
  );
}

function num(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got "${s}"`);
  return n;
}
