import type { Command } from "commander";
import type {
  ElementAction,
  ElementActionResult,
  OpenKind,
  OpenResult,
  ScreenInfoResult,
  UIElement,
  WaitCondition,
  WaitForResult,
  WindowAction,
  WindowActionResult,
  WindowInfo,
} from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { result, info, out, isJsonMode, trunc } from "../output.js";
import { selectorFrom, describeSelector, type SelectorOpts } from "./computeruse.js";

// LCU M2.6: the complete toolset from the shell. Act on an element or a window without coordinates, open a URL, a
// file or an app, wait for a condition instead of sleeping, read the screen.
//   cap element <id> set_value --role text --value "hello"     (Notepad's editor is --role document on Windows)
//   cap element <id> toggle --name Bold
//   cap element <id> select --role "combo box" --name Font --value Arial
//   cap window <id> resize --title Notepad --w 900 --h 600
//   cap open <id> notepad --wait-ms 8000
//   cap wait-for <id> absent --role dialog
//   cap wait-for <id> screen_stable --stable-ms 800
//   cap screen <id>

const ELEMENT_ACTIONS = ["set_value", "clear", "toggle", "expand", "collapse", "invoke", "select", "focus", "scroll_into_view"];
const WINDOW_ACTIONS = ["minimize", "maximize", "restore", "close", "move", "resize", "focus"];
const OPEN_KINDS = ["url", "file", "app"];
const WAIT_CONDITIONS = ["present", "absent", "enabled", "text", "window", "screen_stable"];
const ELEMENT_CONDITIONS = ["present", "absent", "enabled"];

// The states that say how an element action went.
const OUTCOME_STATES = ["checked", "expanded", "selected", "focused"];

function describeElement(e?: UIElement): string {
  if (!e) return "element";
  const name = e.name ? ` "${trunc(e.name, 60)}"` : "";
  const value = e.value ? ` = ${JSON.stringify(trunc(e.value, 40))}` : "";
  const states = (e.states ?? []).filter((s) => OUTCOME_STATES.includes(s));
  return `${e.role}${name}${value}${states.length ? ` (${states.join(", ")})` : ""}`;
}

function describeWindow(w: WindowInfo): string {
  return `"${trunc(w.title, 60)}" at ${w.x},${w.y} ${w.w}x${w.h}`;
}

export function registerToolset(program: Command): void {
  program
    .command("element <id> <action>")
    .description(`Act on an on-screen element without coordinates: ${ELEMENT_ACTIONS.join(", ")}`)
    .option("--role <role>", "Accessible role, e.g. button | text | check box | combo box")
    .option("--name <name>", "Accessible name (substring unless --exact)")
    .option("--text <text>", "Match the name OR the value text")
    .option("--exact", "Require an exact match instead of a substring")
    .option("--state <state>", "Require a state, e.g. enabled | visible | focused")
    .option("--value <text>", "set_value: the new text; select: the option to choose inside the element")
    .option("--window <title>", "Only within the window whose title contains this text")
    .option("--index <n>", "Which match when several do (0 = the first)", (v) => parseInt(v, 10))
    .action((id: string, action: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (!ELEMENT_ACTIONS.includes(action)) throw new Error(`action must be one of ${ELEMENT_ACTIONS.join(", ")}`);
        const local = command.opts<SelectorOpts & { value?: string; window?: string; index?: number }>();
        const r = await client.capsules.elementAction(id, action as ElementAction, selectorFrom(local), {
          value: local.value,
          window: local.window,
          index: local.index,
        });
        result(r, (d: ElementActionResult) => `✓ ${action}: ${describeElement(d.element)}`);
      }),
    );

  program
    .command("window <id> <action>")
    .description(`Act on a window by --title or --id: ${WINDOW_ACTIONS.join(", ")} (move takes --x --y, resize --w --h)`)
    .option("--title <title>", "Window title (substring)")
    .option("--id <windowId>", "Window id from `cap windows`")
    .option("--x <px>", "move: the new left edge", (v) => parseInt(v, 10))
    .option("--y <px>", "move: the new top edge", (v) => parseInt(v, 10))
    .option("--w <px>", "resize: the new width (at least 50)", (v) => parseInt(v, 10))
    .option("--h <px>", "resize: the new height (at least 50)", (v) => parseInt(v, 10))
    .action((id: string, action: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (!WINDOW_ACTIONS.includes(action)) throw new Error(`action must be one of ${WINDOW_ACTIONS.join(", ")}`);
        const local = command.opts<{ title?: string; id?: string; x?: number; y?: number; w?: number; h?: number }>();
        if (!local.title && !local.id) throw new Error("Give --title <text> or --id <windowId>.");
        if (action === "move" && (local.x === undefined || local.y === undefined)) throw new Error("move needs --x and --y.");
        if (action === "resize" && (local.w === undefined || local.h === undefined)) throw new Error("resize needs --w and --h.");
        const r = await client.capsules.windowAction(
          id,
          action as WindowAction,
          { id: local.id, title: local.title },
          { x: local.x, y: local.y, w: local.w, h: local.h },
        );
        const target = local.title ? `"${local.title}"` : local.id;
        result(r, (d: WindowActionResult) => `✓ ${action}: ${d.window ? describeWindow(d.window) : `${target} is gone`}`);
      }),
    );

  program
    .command("open <id> <target>")
    .description("Open a URL, a file or an app by name on a desktop capsule (the kind is guessed unless --kind)")
    .option("--kind <kind>", "url | file | app")
    .option("--wait-ms <ms>", "Wait up to this long for the new window (max 30000)", (v) => parseInt(v, 10))
    .action((id: string, target: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ kind?: string; waitMs?: number }>();
        if (local.kind && !OPEN_KINDS.includes(local.kind)) throw new Error(`--kind must be one of ${OPEN_KINDS.join(", ")}`);
        const r = await client.capsules.open(id, target, { kind: local.kind as OpenKind | undefined, waitMs: local.waitMs });
        result(
          r,
          (d: OpenResult) =>
            `✓ opened ${d.kind} ${target}${d.launched ? ` with ${d.launched}` : ""}${d.window ? `: window ${describeWindow(d.window)}` : ""}`,
        );
      }),
    );

  program
    .command("wait-for <id> <condition>")
    .description(`Wait until a condition holds: ${WAIT_CONDITIONS.join(", ")} (exit 1 if it does not within the timeout)`)
    .option("--role <role>", "Accessible role, e.g. dialog")
    .option("--name <name>", "Accessible name (substring unless --exact)")
    .option("--text <text>", "text: what the name or value must contain; present, absent, enabled: match the name OR the value")
    .option("--exact", "Require an exact match instead of a substring")
    .option("--state <state>", "Require a state, e.g. enabled | visible | focused")
    .option("--window <title>", "window: the title to wait for; the element conditions: only within this window")
    .option("--timeout-ms <ms>", "Give up after this long (default 10000, max 120000)", (v) => parseInt(v, 10))
    .option("--stable-ms <ms>", "screen_stable: how long nothing may change (default 600)", (v) => parseInt(v, 10))
    .action((id: string, condition: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (!WAIT_CONDITIONS.includes(condition)) throw new Error(`condition must be one of ${WAIT_CONDITIONS.join(", ")}`);
        const local = command.opts<SelectorOpts & { window?: string; timeoutMs?: number; stableMs?: number }>();
        if (condition === "text" && !local.text) throw new Error("The text condition needs --text <text>.");
        if (condition === "window" && !local.window) throw new Error("The window condition needs --window <title>.");
        // For the text condition --text is what to wait for; for the others it matches the name or the value.
        const sel: SelectorOpts = {
          role: local.role,
          name: local.name,
          text: condition === "text" ? undefined : local.text,
          exact: local.exact,
          state: local.state,
        };
        const r = await client.capsules.waitFor(id, condition as WaitCondition, {
          selector: ELEMENT_CONDITIONS.includes(condition) || sel.role || sel.name || sel.text ? selectorFrom(sel) : undefined,
          window: local.window,
          text: condition === "text" ? local.text : undefined,
          timeoutMs: local.timeoutMs,
          stableMs: local.stableMs,
        });
        if (!r.met) {
          const what = condition === "text" ? `"${local.text}"` : condition === "window" ? `"${local.window}"` : describeSelector(sel);
          if (isJsonMode()) out(r);
          else info(`Not met after ${r.waitedMs ?? "?"}ms: ${condition} ${what}`.trimEnd());
          process.exitCode = 1;
          return;
        }
        result(r, (d: WaitForResult) => {
          const what = d.element ? `: ${describeElement(d.element)}` : d.window ? `: window ${describeWindow(d.window)}` : "";
          return `✓ ${condition} after ${d.waitedMs}ms${what}`;
        });
      }),
    );

  program
    .command("screen <id>")
    .description("Show the screen's size, the pointer's position and the active window")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.capsules.screenInfo(id);
        result(r, (d: ScreenInfoResult) => {
          const active = d.activeWindow ? `\nactive window ${describeWindow(d.activeWindow)} (id ${d.activeWindow.id})` : "";
          return `${d.width}x${d.height}  pointer at ${d.cursor.x},${d.cursor.y}${active}`;
        });
      }),
    );
}
