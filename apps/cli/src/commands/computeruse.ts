import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import type { ElementSelector, ScreenshotResult, UINode, UITreeResult } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { result, success, info, out, isJsonMode, table, trunc, fmtBytes } from "../output.js";

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
    .option("-o, --out <file>", "Save the image to a file instead of printing base64")
    .option("--format <format>", "png (default) | jpeg (smaller)")
    .option("--quality <n>", "JPEG quality, 1 to 100 (default 75)", (v) => parseInt(v, 10))
    .option("--scale <f>", "Shrink the image to this fraction of the screen, 0.1 to 1", (v) => parseFloat(v))
    .option("--region <x,y,w,h>", "Only this rectangle of the screen, in pixels")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ out?: string; format?: string; quality?: number; scale?: number; region?: string }>();
        if (local.format && local.format !== "png" && local.format !== "jpeg") throw new Error("--format must be png or jpeg");
        const s = await client.capsules.screenshot(id, {
          format: local.format as "png" | "jpeg" | undefined,
          quality: local.quality,
          scale: local.scale,
          ...parseRegion(local.region),
        });
        if (local.out) {
          writeFileSync(local.out, Buffer.from(s.imageB64 ?? "", "base64"));
          success(`Saved screenshot to ${local.out} (${shotSize(s)})`);
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

  // Decision 55: a drag along a path of points (curves, circles, any shape a hand draws).
  withShotOptions(
    program
      .command("stroke <id> <points...>")
      .description("Drag along a path of x,y points, e.g. cap stroke <id> 100,200 150,180 200,220 --smooth")
      .option("-b, --button <button>", "left | right | middle", "left")
      .option("--smooth", "Draw a curve through the points")
      .option("--closed", "Return to the first point")
      .option("--step-ms <ms>", "Pause between points (default 8)", (v) => parseInt(v, 10)),
  ).action((id: string, points: string[], _o, command: Command) =>
    withClient(command, async (client) => {
      const local = command.opts<{ button?: any; smooth?: boolean; closed?: boolean; stepMs?: number } & ShotOpts>();
      const path = points.map((p) => {
        const m = /^(-?\d+),(-?\d+)$/.exec(p.trim());
        if (!m) throw new Error(`a point is x,y in pixels: ${p}`);
        return [Number(m[1]), Number(m[2])] as [number, number];
      });
      const r = await client.capsules.stroke(id, path, { smooth: local.smooth, closed: local.closed, stepMs: local.stepMs, button: local.button, ...shotArgs(local) });
      result(r, () => `✓ stroke through ${path.length} points${local.smooth ? " (smooth)" : ""}`);
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

  // ── deep computer-use (Phase CU): structured introspection + rich primitives ──

  program
    .command("ui-tree <id>")
    .description("Dump the accessibility tree of a desktop capsule (roles, names, click points)")
    .option("-d, --depth <n>", "Maximum tree depth", (v) => parseInt(v, 10))
    .option("--window <title>", "Only the window whose title contains this text")
    .option("--all", "Include every node, not just the interesting (interactive/labelled) ones")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ depth?: number; window?: string; all?: boolean }>();
        const r = await client.capsules.uiTree(id, {
          maxDepth: local.depth,
          window: local.window,
          interesting: !local.all,
        });
        result(r, (d: UITreeResult) => renderTree(d));
      }),
    );

  program
    .command("find <id>")
    .description("Find on-screen elements by role / name / text; each match has a click point (cx, cy)")
    .option("--role <role>", "Accessible role, e.g. button")
    .option("--name <name>", "Accessible name (substring unless --exact)")
    .option("--text <text>", "Match the name OR the value text")
    .option("--exact", "Require an exact match instead of a substring")
    .option("--state <state>", "Require a state, e.g. enabled | visible | focused")
    .option("--limit <n>", "Maximum number of matches", (v) => parseInt(v, 10))
    .option("--window <title>", "Search only the window whose title contains this text")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<SelectorOpts & { limit?: number; window?: string }>();
        const r = await client.capsules.findElement(id, selectorFrom(local), {
          limit: local.limit,
          window: local.window,
        });
        result(r, (d: any) =>
          !d.matches?.length
            ? "(no matches)"
            : table(
                d.matches.map((m: any) => ({
                  role: m.role,
                  name: trunc(m.name, 40),
                  cx: m.cx,
                  cy: m.cy,
                  size: `${m.w}x${m.h}`,
                  states: (m.states ?? []).join(","),
                })),
                ["role", "name", "cx", "cy", "size", "states"],
              ),
        );
      }),
    );

  program
    .command("wait <id>")
    .description("Wait until an element appears on screen (exit 1 if it does not within --timeout)")
    .option("--name <name>", "Accessible name (substring unless --exact)")
    .option("--role <role>", "Accessible role, e.g. dialog")
    .option("--text <text>", "Match the name OR the value text")
    .option("--exact", "Require an exact match instead of a substring")
    .option("--state <state>", "Require a state, e.g. enabled | visible | focused")
    .option("--timeout <ms>", "Give up after this many milliseconds", (v) => parseInt(v, 10))
    .option("--window <title>", "Search only the window whose title contains this text")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<SelectorOpts & { timeout?: number; window?: string }>();
        const r = await client.capsules.waitElement(id, selectorFrom(local), {
          timeoutMs: local.timeout,
          window: local.window,
        });
        if (!r.found) {
          if (isJsonMode()) out(r);
          else info(`Not found after ${r.waitedMs ?? "?"}ms: ${describeSelector(local)}`);
          process.exitCode = 1;
          return;
        }
        result(r, (d: any) => {
          const e = d.element ?? {};
          return `✓ found ${e.role ?? "element"}${e.name ? ` "${e.name}"` : ""} at (${e.cx},${e.cy}) after ${d.waitedMs ?? "?"}ms`;
        });
      }),
    );

  const clip = program.command("clipboard").description("Read or write the desktop clipboard");
  clip
    .command("get <id>")
    .description("Print the clipboard text")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.clipboardGet(id);
        result(r, (d: any) => d.text ?? "");
      }),
    );
  clip
    .command("set <id> <text>")
    .description("Put text on the clipboard")
    .action((id: string, text: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.clipboardSet(id, text);
        result(r, () => `✓ clipboard set (${text.length} chars)`);
      }),
    );

  program
    .command("windows <id>")
    .description("List top-level windows (id, title, bounds, active)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.windowList(id);
        result(r, (d: any) =>
          table(
            (d.windows ?? []).map((w: any) => ({
              id: w.id,
              title: trunc(w.title, 60),
              active: w.active ? "*" : "",
              bounds: `${w.x},${w.y} ${w.w}x${w.h}`,
            })),
            ["id", "title", "active", "bounds"],
          ),
        );
      }),
    );

  program
    .command("focus <id>")
    .description("Raise and focus a window by title or id")
    .option("--title <title>", "Window title (substring)")
    .option("--id <windowId>", "Window id from `cap windows`")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ title?: string; id?: string }>();
        if (!local.title && !local.id) throw new Error("Give --title <text> or --id <windowId>.");
        const r = await client.capsules.windowFocus(id, { id: local.id, title: local.title });
        result(r, () => `✓ focused ${local.title ? `"${local.title}"` : local.id}`);
      }),
    );

  program
    .command("ocr <id>")
    .description("Recognize text on screen (for text not exposed in the accessibility tree)")
    .option("--region <x,y,w,h>", "Only this rectangle, in pixels")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ region?: string }>();
        const r = await client.capsules.ocr(id, parseRegion(local.region));
        result(r, (d: any) => d.text ?? "");
      }),
    );

  program
    .command("pixel <id> <x> <y>")
    .description("Read a pixel's colour (#rrggbb)")
    .action((id: string, x: string, y: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.pixel(id, parseInt(x, 10), parseInt(y, 10));
        result(r, (d: any) => `${d.color}  (r ${d.r}, g ${d.g}, b ${d.b})`);
      }),
    );

  program
    .command("menus <id>")
    .description("List every menu of the focused window with its items (opens each menu, then closes it)")
    .option("--window <title>", "The window whose title contains this")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ window?: string }>();
        const r = await client.capsules.menus(id, local.window);
        result(r, (d: any) =>
          [
            `Menus of ${d.window ?? "the focused window"}:`,
            ...d.menus.flatMap((m: any) => [
              `${m.name}${m.enabled ? "" : " (disabled)"}`,
              ...(m.items ?? []).map(
                (it: any) => `  ${it.name}${it.submenu ? " >" : ""}${it.checked ? " [x]" : ""}${it.enabled ? "" : " (disabled)"}`,
              ),
            ]),
          ].join("\n"),
        );
      }),
    );

  program
    .command("trace <id>")
    .description("Show the structured action trace (every interaction this run, in order)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.trace(id);
        result(r, (d: any) =>
          !d.events?.length
            ? "(no events)"
            : table(
                d.events.map((e: any) => ({
                  at: e.at,
                  action: e.action,
                  detail: trunc(JSON.stringify(e.detail ?? {}), 80),
                })),
                ["at", "action", "detail"],
              ),
        );
      }),
    );

  // ── checkpoint / rollback (Phase CU.3): snapshot-backed safety net for agents ──

  const cp = program.command("checkpoint").description("Checkpoint a capsule's disk so an agent can roll back");
  cp.command("create <id>", { isDefault: true })
    .description("Capture a checkpoint (prints its id); `cap checkpoint <id>` is the same")
    .option("-n, --name <name>", "Checkpoint name")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ name?: string }>();
        const s = await client.capsules.checkpoint(id, { name: local.name });
        if (isJsonMode()) {
          out(s);
          return;
        }
        process.stdout.write(`${s.id}\n`);
        success(`Checkpoint ${s.id}${s.name ? ` "${s.name}"` : ""} captured (${fmtBytes(s.sizeBytes)})`);
      }),
    );
  cp.command("list <id>")
    .description("List a capsule's checkpoints")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.capsules.listCheckpoints(id);
        result(list, (rows: any[]) =>
          table(
            rows.map((s) => ({
              id: s.id,
              name: s.name ?? "",
              size: fmtBytes(s.sizeBytes),
              created: String(s.createdAt ?? "").slice(0, 19),
            })),
            ["id", "name", "size", "created"],
          ),
        );
      }),
    );

  program
    .command("rollback <id> <checkpointId>")
    .description("Restore a checkpoint into a fresh capsule (the current capsule is destroyed unless --keep)")
    .option("-s, --size <size>", "Size of the restored capsule (default: same as the current one)")
    .option("--keep", "Keep the current capsule running instead of destroying it")
    .option("-w, --wait", "Wait until the restored capsule is ACTIVE")
    .action((id: string, checkpointId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ size?: string; keep?: boolean; wait?: boolean }>();
        const c = await client.capsules.rollback(id, checkpointId, {
          size: local.size,
          destroyCurrent: !local.keep,
        });
        if (local.wait) await c.waitUntilActive();
        result(
          c.data,
          (d: any) =>
            `✓ Rolled back to ${checkpointId}: new capsule ${d.sessionId} (${d.status})` +
            (local.keep ? "" : `\n  ${id} was destroyed; use ${d.sessionId} from here on`),
        );
      }),
    );
}

export type SelectorOpts = { role?: string; name?: string; text?: string; exact?: boolean; state?: string };

export function selectorFrom(o: SelectorOpts): ElementSelector {
  if (!o.role && !o.name && !o.text) throw new Error("Give at least one of --role, --name or --text.");
  const sel: ElementSelector = {};
  if (o.role) sel.role = o.role;
  if (o.name) sel.name = o.name;
  if (o.text) sel.text = o.text;
  if (o.exact) sel.exact = true;
  if (o.state) sel.state = o.state;
  return sel;
}

export function describeSelector(o: SelectorOpts): string {
  return [o.role && `role=${o.role}`, o.name && `name="${o.name}"`, o.text && `text="${o.text}"`, o.state && `state=${o.state}`]
    .filter(Boolean)
    .join(" ");
}

function parseRegion(s?: string): { x?: number; y?: number; w?: number; h?: number } | undefined {
  if (!s) return undefined;
  const parts = s.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Expected --region x,y,w,h (four numbers), got "${s}"`);
  }
  const [x, y, w, h] = parts as [number, number, number, number];
  return { x, y, w, h };
}

/** A screenshot's size and, when scaled or partial, how it maps to the screen (x = region x + x / scale). */
function shotSize(s: ScreenshotResult): string {
  const r = s.region;
  return `${s.width ?? "?"}x${s.height ?? "?"}` + (s.scale ? `, scale ${s.scale}` : "") + (r ? `, region ${r.x},${r.y} ${r.w}x${r.h}` : "");
}

function renderTree(d: UITreeResult): string {
  const lines: string[] = [
    `backend: ${d.backend}` +
      (d.nodeCount != null ? `  nodes: ${d.nodeCount}` : "") +
      (d.truncated ? "  (truncated)" : ""),
  ];
  const walk = (n: UINode, depth: number) => {
    const name = n.name ? ` "${trunc(n.name, 60)}"` : "";
    const value = n.value ? ` = ${JSON.stringify(trunc(n.value, 40))}` : "";
    lines.push(`${"  ".repeat(depth)}${n.role}${name}${value}  @(${n.cx},${n.cy})`);
    for (const c of n.children ?? []) walk(c, depth + 1);
  };
  for (const r of d.roots ?? []) walk(r, 0);
  if (lines.length === 1) lines.push("(empty tree)");
  return lines.join("\n");
}

function num(s: string): number {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got "${s}"`);
  return n;
}
