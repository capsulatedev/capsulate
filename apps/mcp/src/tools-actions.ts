// LCU M2.4 — run_actions as an MCP tool: several steps on a desktop capsule in ONE call. The model decides the next
// few steps at once; the server runs them back to back at machine speed (the person watching sees one smooth
// motion) and stops at the first that fails, then returns one report and, if asked, a look at the end.

import { z } from "zod";
import type { BrowserSnapshot, RunActionsResult, RunStepResult } from "@capsulate/sdk";
import type { ToolKit } from "./tools-live.js";
import { outline } from "./tools-browser.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

const MAX_DETAIL = 4000; // characters of one step's result in the report
const MAX_IMAGES = 3; // screenshots attached (the last ones)

function clip(s: string, n = MAX_DETAIL) {
  return s.length > n ? `${s.slice(0, n)}... (${s.length - n} more characters)` : s;
}

function compact(v: unknown) {
  return clip(JSON.stringify(v ?? null).replace(/"(base64|imageB64)":"[^"]*"/g, '"$1":"(image)"'));
}

/** A browser step's endpoint answers {ok, result, driverMs}; the rest answer their result directly. */
function inner(s: RunStepResult): any {
  const r = s.result as any;
  return s.do.startsWith("browser_") && r && typeof r === "object" && "result" in r ? r.result : r;
}

function el(e: any) {
  return e ? `${e.role || "element"}${e.name ? ` ${JSON.stringify(e.name)}` : ""}` : "";
}

/** The states that say how an element action went (the value is not repeated: it may be what was typed). */
function outcome(e: any) {
  const s = (e?.states ?? []).filter((x: string) => ["checked", "expanded", "selected", "focused"].includes(x));
  return s.length ? ` (${s.join(", ")})` : "";
}

function win(w: any) {
  return w ? `window ${JSON.stringify(w.title ?? "")} at ${w.x}, ${w.y}, ${w.w}x${w.h}` : "";
}

/** What one step did, in a few words; reading steps carry what they read. */
function detail(s: RunStepResult): string {
  const r = inner(s);
  if (r === undefined || r === null) return "";
  switch (s.do) {
    case "click_element":
      return r.element ? `clicked ${el(r.element)} at ${r.element.cx}, ${r.element.cy}` : "";
    case "browser_open":
    case "browser_navigate":
      return r.url ? `at ${r.url}${r.title ? ` (${r.title})` : ""}` : "";
    case "browser_click":
      return `clicked ${el(r.clicked)}${r.url ? `, now at ${r.url}` : ""}`;
    case "browser_fill":
      return `filled ${el(r.filled)} (${r.chars} characters${r.submitted ? ", submitted" : ""})`;
    case "browser_select":
      return `chose ${JSON.stringify(r.selected)}`;
    case "browser_wait":
    case "wait_element":
      return r.found === false ? "gone" : `found ${el(r.element)}`.trim();
    case "browser_snapshot":
      return "\n" + clip(outline(r as BrowserSnapshot));
    case "browser_text":
      return "\n" + clip(String(r.text ?? ""));
    case "browser_eval":
      return compact(r.value);
    case "find_element":
      return `${r.count ?? 0} match(es)${r.matches?.[0] ? `, first ${el(r.matches[0])} at ${r.matches[0].cx}, ${r.matches[0].cy}` : ""}`;
    case "element":
      return r.element ? `${el(r.element)}${outcome(r.element)}` : "";
    case "window":
      return r.window ? `now ${win(r.window)}` : "the window is gone";
    case "open":
      return `opened ${r.kind ?? "it"}${r.launched ? ` with ${r.launched}` : ""}${r.window ? `, ${win(r.window)}` : ""}`;
    case "wait_for":
      return `met after ${r.waitedMs} ms${r.element ? `: ${el(r.element)}` : r.window ? `: ${win(r.window)}` : ""}`;
    case "screen":
      return `${r.width}x${r.height}, pointer at ${r.cursor?.x}, ${r.cursor?.y}${r.activeWindow ? `, active ${win(r.activeWindow)}` : ""}`;
    case "clipboard":
      return compact(r.text ?? "");
    case "use":
      return `${r.skill}:${r.procedure} (version ${r.version}, ${r.steps} steps)`;
    case "check":
      return String(r.detail ?? "");
    case "pixel":
      return `${r.color} at ${r.x}, ${r.y}`;
    case "menus":
      return "\n" + menusText(r);
    case "screenshot":
    case "browser_screenshot":
      return "(image below)";
    case "click":
    case "type":
    case "key":
    case "move":
    case "scroll":
    case "drag":
    case "clipboard_set":
    case "window_focus":
    case "say":
    case "pause":
    case "browser_press":
    case "browser_scroll":
      return "";
    default:
      return compact(r);
  }
}

/** A window's menus, one line per menu. */
export function menusText(r: any): string {
  const menus: any[] = r?.menus ?? [];
  if (!menus.length) return "(no menus)";
  return clip(
    menus
      .map(
        (m) =>
          `${m.name}${m.enabled === false ? " (disabled)" : ""}: ` +
          ((m.items ?? []) as any[])
            .map((it) => `${it.name}${it.submenu ? " >" : ""}${it.checked ? " [x]" : ""}${it.enabled ? "" : " (disabled)"}`)
            .join(", "),
      )
      .join("\n"),
  );
}

function imageOf(s: RunStepResult | undefined): Content | null {
  const r = s && s.ok ? inner(s) : null;
  if (!r) return null;
  if (s!.do === "screenshot" && r.imageB64) return { type: "image", data: r.imageB64, mimeType: r.format === "jpeg" ? "image/jpeg" : "image/png" };
  if (s!.do === "browser_screenshot" && r.base64) return { type: "image", data: r.base64, mimeType: r.format === "png" ? "image/png" : "image/jpeg" };
  return null;
}

/** The run as a short report plus its screenshots. */
export function runReport(r: RunActionsResult): Content[] {
  const secs = (r.ms / 1000).toFixed(1);
  const lines = [
    r.ok
      ? `Ran ${r.completed} of ${r.total} steps in ${secs} s.`
      : `Stopped at step ${(r.stoppedAt ?? 0) + 1} of ${r.total} (${r.stopReason}) after ${r.completed} ok in ${secs} s.`,
  ];
  for (const s of r.steps) {
    const d = s.ok ? detail(s) : "";
    let l = `${s.i + 1}. ${s.do} ${s.ok ? "ok" : `FAILED: ${s.error ?? "error"}`}${d ? (d.startsWith("\n") ? `:${d}` : `: ${d}`) : ""}`;
    if (s.ok && s.expect) l += " (expect met)";
    lines.push(l);
  }
  if (r.variables && Object.keys(r.variables).length) lines.push(`Saved: ${compact(r.variables)}`);
  if (r.stopReason === "human_in_control") {
    lines.push("A person holds the screen. Call capsulate_wait_for_handback, then run the remaining steps.");
  } else if (r.stopReason === "time_budget") {
    lines.push("The run used its 90 s. Run the remaining steps in another call.");
  }
  const o = r.observation;
  if (o) {
    const d = o.ok ? detail(o) : `FAILED: ${o.error}`;
    if (o.do !== "screenshot" && o.do !== "browser_screenshot") lines.push(`Look at the end (${o.do}):${d.startsWith("\n") ? d : ` ${d}`}`);
  }
  const images = [...r.steps, ...(o ? [o] : [])].map(imageOf).filter((x): x is Content => x !== null).slice(-MAX_IMAGES);
  return [{ type: "text", text: lines.join("\n") }, ...images];
}

export const ACTIONS_INSTRUCTIONS =
  "When you know the next few steps (fill a form, click through a dialog, type then save), send them together with capsulate_run_actions: one call, the steps run back to back, the person watching sees one smooth motion, and the run stops at the first step that fails. Steps can mix commands and files with the screen (write_file, then open it to show it). Add expect to a step to wait for what should follow it, and observe 'screenshot' or 'browser_snapshot' to see the result in the same call.";

export function registerActionTools(t: ToolKit) {
  const { server, cap, ok, err } = t;
  server.registerTool(
    "capsulate_menus",
    {
      title: "List an application's menus",
      description:
        "List every menu of the focused window (or the window whose title contains window) with its items, read by opening each menu and closing it again. The quick way to learn what an application can do before you explore it; it takes a few seconds and the person watching sees the menus open.",
      inputSchema: { sessionId: z.string(), window: z.string().optional() },
    },
    async (a) => {
      try {
        const r = await cap.capsules.menus(a.sessionId, a.window);
        return ok(`Menus of ${r.window ?? "the focused window"}:\n${menusText(r)}`);
      } catch (e) {
        return err(e);
      }
    },
  );
  server.registerTool(
    "capsulate_run_actions",
    {
      title: "Run several steps in one call",
      description: [
        "Run a list of steps on a desktop capsule in ONE call, back to back; the run stops at the first step that fails. Prefer it over one call per step whenever you know what comes next.",
        "Each step is {do: verb, ...that verb's fields}:",
        "screen: click {x, y, button?, count?}, type {text}, key {keys: ['ctrl+s']}, move {x, y}, scroll {x, y, dx, dy}, drag {x1, y1, x2, y2, button?} or {path: [[x, y], ...], smooth?, closed?, stepMs?, button?} (a stroke through the points), screenshot {format?, scale?, x?, y?, w?, h?}, ui_tree, find_element {selector}, wait_element {selector, timeoutMs}, clipboard, clipboard_set {text}, windows, window_focus {title}, ocr;",
        "without coordinates: element {action, selector, value?, window?} (action set_value, clear, toggle, expand, collapse, invoke, select, focus or scroll_into_view), window {action, title | id, x?, y?, w?, h?} (minimize, maximize, restore, close, move, resize), open {target, kind?, waitMs?}, wait_for {condition, selector?, window?, text?, timeoutMs?, stableMs?} (present, absent, enabled, text, window, screen_stable; a wait that ends unmet fails the step), screen (its size, the pointer, the active window);",
        "browser: browser_open {url}, browser_navigate {url}, browser_snapshot, browser_click {ref | text | selector}, browser_fill {ref, value, submit?}, browser_select {ref, option}, browser_press {keys}, browser_scroll {dy}, browser_wait {text | ref, state?}, browser_text, browser_eval {expression}, browser_screenshot;",
        "commands and files: exec {cmd: [...], cwd?, timeoutSec?}, write_file {path, content}, read_file {path, maxBytes?} (a text file comes back as text); they also run while a person holds the screen;",
        "helpers: click_element {selector: {role?, name?, text?}, waitMs?} (find, waiting up to 5 s, then click its centre), say {text} (narrate for the person watching), pause {ms};",
        "skills: use {procedure, skill?, version?, args?} (run a procedure of a skill from capsulate_skills with its args; the call's skill is the default), check {element: selector, present?} | {window: title} | {exec: [...], exitCode?, contains?} | {file, contains?} | {pixel: {x, y, color, tolerance?}} (with timeoutMs? it waits; a check that does not hold fails), pixel {x, y} (a pixel's colour), menus {window?} (every menu's items).",
        "A step can say frame: '<name>' to give its coordinates in a frame of the call's frames (screen = origin + scale * (x, y), a stroke clamped inside clamp), and save: {variable: resultField} to keep a result for later steps as {{variable}}.",
        "Any step can carry expect (a wait that must succeed after it: {selector, timeoutMs} after a screen step, {text | ref | selector, timeoutMs} after a browser step) and optional: true (may fail without stopping the run).",
        "observe returns a look at the end, also when the run stopped early: 'screenshot', 'ui_tree' or 'browser_snapshot'. At most 200 steps and 90 s per call. Never put passwords or other secrets in steps; hand those to the person (capsulate_handoff).",
      ].join(" "),
      inputSchema: {
        sessionId: z.string(),
        steps: z
          .array(z.object({ do: z.string().describe("The verb, e.g. click_element, type, key, browser_click") }).passthrough())
          .min(1)
          .max(200),
        observe: z.enum(["none", "screenshot", "ui_tree", "browser_snapshot"]).optional(),
        skill: z.string().optional().describe("The skill use steps call when they name none"),
        frames: z
          .record(
            z.object({
              origin: z.tuple([z.number(), z.number()]),
              scale: z.number(),
              clamp: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]).optional(),
            }),
          )
          .optional()
          .describe("Coordinate frames steps may name, e.g. {canvas: {origin: [346, 176], scale: 0.42, clamp: [[0, 0], [900, 1200]]}}"),
      },
    },
    async (a) => {
      try {
        const r = await cap.capsules.runActions(a.sessionId, a.steps as any, { observe: a.observe, skill: a.skill, frames: a.frames });
        return { content: runReport(r) };
      } catch (e) {
        return err(e);
      }
    },
  );
}
