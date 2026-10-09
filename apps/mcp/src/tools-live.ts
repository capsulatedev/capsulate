// Phase LCU — the MCP tools for live computer use: the deep desktop verbs, plus the shared screen a person
// watches (console links), who drives it (control, handoff, wait) and narration (say).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Capsulate } from "@capsulate/sdk";

type TextResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export interface ToolKit {
  server: McpServer;
  cap: Capsulate;
  ok: (data: unknown) => TextResult;
  err: (e: unknown) => TextResult;
  withShot: (r: { screenshot?: { imageB64?: string } }, msg: string) => unknown;
}

// Opt-in post-action screenshot for the input verbs (same fields as the core tools).
const shotSchema = {
  screenshot: z.boolean().optional().describe("Capture a screenshot after the action and return it"),
  screenshotDelayMs: z.number().optional().describe("Settle delay (ms) before that screenshot so it reflects the result (max 10000)"),
};

const selectorSchema = {
  role: z.string().optional().describe("Accessible role, e.g. 'button', 'menu item', 'text', 'terminal' (Linux AT-SPI) or 'Button', 'Edit' (Windows UI Automation)"),
  name: z.string().optional().describe("Accessible name (label) to match"),
  text: z.string().optional().describe("Match against the name OR the value"),
  exact: z.boolean().optional().describe("Require an exact match instead of a substring"),
  state: z.string().optional().describe("Require a state, e.g. 'enabled', 'visible', 'focused'"),
};

function selectorOf(a: { role?: string; name?: string; text?: string; exact?: boolean; state?: string }) {
  const s: Record<string, unknown> = {};
  for (const k of ["role", "name", "text", "exact", "state"] as const) if (a[k] !== undefined) s[k] = a[k];
  return s;
}

const MAX_WAIT_SECONDS = 900;

export function registerLiveTools(t: ToolKit) {
  const { server, cap, ok, err, withShot } = t;

  // ---- the remaining pointer verbs ----

  server.registerTool(
    "capsulate_move",
    {
      title: "Move the pointer",
      description: "Move the mouse pointer of a desktop capsule to (x, y) in screen pixels.",
      inputSchema: { sessionId: z.string(), x: z.number(), y: z.number(), ...shotSchema },
    },
    async (a) => {
      try {
        const r = await cap.capsules.move(a.sessionId, a.x, a.y, { screenshot: a.screenshot, screenshotDelayMs: a.screenshotDelayMs });
        return withShot(r, `moved to (${a.x}, ${a.y})`) as TextResult;
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_scroll",
    {
      title: "Scroll",
      description: "Scroll at (x, y) in a desktop capsule. dy > 0 scrolls down, dy < 0 up; dx scrolls sideways. Units are wheel clicks.",
      inputSchema: { sessionId: z.string(), x: z.number(), y: z.number(), dx: z.number().optional(), dy: z.number().optional(), ...shotSchema },
    },
    async (a) => {
      try {
        const r = await cap.capsules.scroll(a.sessionId, a.x, a.y, a.dx ?? 0, a.dy ?? 0, { screenshot: a.screenshot, screenshotDelayMs: a.screenshotDelayMs });
        return withShot(r, `scrolled (${a.dx ?? 0}, ${a.dy ?? 0}) at (${a.x}, ${a.y})`) as TextResult;
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_drag",
    {
      title: "Drag",
      description: "Press at (x1, y1), drag to (x2, y2) and release, in a desktop capsule.",
      inputSchema: {
        sessionId: z.string(),
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
        button: z.enum(["left", "right", "middle"]).optional(),
        ...shotSchema,
      },
    },
    async (a) => {
      try {
        const r = await cap.capsules.drag(a.sessionId, a.x1, a.y1, a.x2, a.y2, a.button, { screenshot: a.screenshot, screenshotDelayMs: a.screenshotDelayMs });
        return withShot(r, `dragged (${a.x1}, ${a.y1}) to (${a.x2}, ${a.y2})`) as TextResult;
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- deep computer use: read the UI instead of guessing pixels ----

  server.registerTool(
    "capsulate_ui_tree",
    {
      title: "Read the UI tree",
      description:
        "Return the accessibility tree of a desktop capsule (AT-SPI on Linux, UI Automation on Windows): roles, names, values, states and screen rectangles with centers (cx, cy) you can click. Far cheaper and more exact than reading a screenshot.",
      inputSchema: {
        sessionId: z.string(),
        maxDepth: z.number().optional().describe("Depth limit (default the server's)"),
        window: z.string().optional().describe("Only the window whose title contains this"),
        interesting: z.boolean().optional().describe("Only actionable or labelled nodes (default true)"),
      },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.uiTree(a.sessionId, { maxDepth: a.maxDepth, window: a.window, interesting: a.interesting }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_find_element",
    {
      title: "Find UI elements",
      description: "Find accessible elements by role / name / text in a desktop capsule. Each match has a center (cx, cy) to click.",
      inputSchema: { sessionId: z.string(), ...selectorSchema, limit: z.number().optional(), window: z.string().optional() },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.findElement(a.sessionId, selectorOf(a), { limit: a.limit, window: a.window }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_wait_element",
    {
      title: "Wait for a UI element",
      description: "Wait until an accessible element matching the selector appears (for example after a page load).",
      inputSchema: { sessionId: z.string(), ...selectorSchema, timeoutMs: z.number().optional().describe("Default 10000"), window: z.string().optional() },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.waitElement(a.sessionId, selectorOf(a), { timeoutMs: a.timeoutMs, window: a.window }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_click_element",
    {
      title: "Click a UI element",
      description: "Find an accessible element (waiting for it if needed) and click its center. The reliable way to press a named button or link.",
      inputSchema: {
        sessionId: z.string(),
        ...selectorSchema,
        button: z.enum(["left", "right", "middle"]).optional(),
        count: z.number().optional().describe("2 for a double click"),
        waitMs: z.number().optional().describe("How long to wait for the element (default 5000)"),
        window: z.string().optional(),
      },
    },
    async (a) => {
      try {
        const c = await cap.capsules.get(a.sessionId);
        const el = await c.findAndClick(selectorOf(a), { button: a.button, count: a.count, waitMs: a.waitMs, window: a.window });
        return ok({ clicked: true, element: el });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_clipboard",
    {
      title: "Read or set the clipboard",
      description: "Without `text`, return the desktop capsule's clipboard. With `text`, put that text on the clipboard (then paste with ctrl+v). Pasting long text is faster and safer than typing it.",
      inputSchema: { sessionId: z.string(), text: z.string().optional() },
    },
    async (a) => {
      try {
        if (a.text !== undefined) {
          await cap.capsules.clipboardSet(a.sessionId, a.text);
          return ok(`clipboard set (${a.text.length} characters)`);
        }
        return ok(await cap.capsules.clipboardGet(a.sessionId));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_windows",
    {
      title: "List or focus windows",
      description: "Without a target, list the open windows of a desktop capsule. With `id` or `title`, bring that window to the front.",
      inputSchema: { sessionId: z.string(), id: z.string().optional(), title: z.string().optional() },
    },
    async (a) => {
      try {
        if (a.id || a.title) {
          await cap.capsules.windowFocus(a.sessionId, { id: a.id, title: a.title });
          return ok(`focused ${a.title ?? a.id}`);
        }
        return ok(await cap.capsules.windowList(a.sessionId));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_ocr",
    {
      title: "Read the text on screen",
      description: "OCR the desktop capsule's screen (or a region) and return the words with their boxes. Use when the UI tree has no labels (canvas apps, images).",
      inputSchema: { sessionId: z.string(), x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional() },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.ocr(a.sessionId, { x: a.x, y: a.y, w: a.w, h: a.h }));
      } catch (e) {
        return err(e);
      }
    },
  );

  // ---- the live shared screen: watch, take turns, narrate ----

  server.registerTool(
    "capsulate_console_link",
    {
      title: "Get a live console link",
      description:
        "Mint a signed, expiring URL that opens the desktop capsule's LIVE screen in any browser with no login. The person watching sees your pointer, clicks and keys as you act, plus your narration. mode 'control' (default) also lets them take the screen and hand it back; 'view' only watches. Open it in your browser pane or give it to the person.",
      inputSchema: {
        sessionId: z.string(),
        mode: z.enum(["control", "view"]).optional(),
        ttlMinutes: z.number().optional().describe("Lifetime in minutes (default 240, max 1440)"),
      },
    },
    async (a) => {
      try {
        const link = await cap.capsules.consoleLink(a.sessionId, {
          mode: a.mode,
          ttlSec: a.ttlMinutes ? Math.round(a.ttlMinutes * 60) : undefined,
        });
        return ok({ url: link.url, mode: link.mode, expiresAt: link.expiresAt });
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_control",
    {
      title: "Who is driving the screen",
      description:
        "Read or change who drives a desktop capsule's shared screen. state 'free' (nobody), 'agent' (you; every input renews a 45 s hold) or 'human' (a person; your input is refused until they hand it back). action 'status' (default) reads it, 'take' claims it for you, 'release' lets go when you finish so the person can use the screen.",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["status", "take", "release"]).optional(),
        note: z.string().optional().describe("Optional note shown on the console"),
      },
    },
    async (a) => {
      try {
        const st =
          a.action === "take"
            ? await cap.capsules.takeControl(a.sessionId, { note: a.note })
            : a.action === "release"
              ? await cap.capsules.releaseControl(a.sessionId, { note: a.note })
              : await cap.capsules.control(a.sessionId);
        return ok(st);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_handoff",
    {
      title: "Hand the screen to a person",
      description:
        "Hand the desktop capsule's screen to the person watching, with a note saying exactly what you need (sign in, solve a CAPTCHA, approve a payment, check something). The console shows 'The AI needs you' with your note. Then waits until they press Done, hand back, and returns their note. Use this instead of typing passwords or secrets yourself.",
      inputSchema: {
        sessionId: z.string(),
        note: z.string().describe("What the person should do, in one or two plain sentences"),
        waitSeconds: z.number().optional().describe("How long to wait for the hand back (default 300, max 900). 0 returns at once."),
      },
    },
    async (a) => {
      try {
        const waitSec = Math.max(0, Math.min(a.waitSeconds ?? 300, MAX_WAIT_SECONDS));
        const r = await cap.capsules.handoff(a.sessionId, a.note, { wait: waitSec > 0, timeoutMs: waitSec * 1000 });
        if (waitSec === 0) return ok({ handedOver: true, control: r.control, next: "Call capsulate_wait_for_handback to wait for the person." });
        return ok(handbackSummary(r));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_wait_for_handback",
    {
      title: "Wait for the person to hand back",
      description: "Wait until the person holding the desktop capsule's screen hands it back. Returns at once when nobody holds it. Returns their note.",
      inputSchema: {
        sessionId: z.string(),
        waitSeconds: z.number().optional().describe("Default 300, max 900"),
      },
    },
    async (a) => {
      try {
        const waitSec = Math.max(1, Math.min(a.waitSeconds ?? 300, MAX_WAIT_SECONDS));
        return ok(handbackSummary(await cap.capsules.waitForHandback(a.sessionId, { timeoutMs: waitSec * 1000 })));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_say",
    {
      title: "Narrate to the person watching",
      description: "Show one short line on the live console of a desktop capsule, e.g. 'Opening the settings to change the theme'. Narrate each step so the person watching knows what you are doing and why.",
      inputSchema: { sessionId: z.string(), text: z.string().describe("One short sentence (max 500 characters)") },
    },
    async (a) => {
      try {
        await cap.capsules.say(a.sessionId, a.text);
        return ok("shown on the live console");
      } catch (e) {
        return err(e);
      }
    },
  );
}

function handbackSummary(r: { handedBack: boolean; control: { state: string }; note?: string }) {
  if (r.handedBack) {
    return { handedBack: true, note: r.note ?? null, state: r.control.state, next: "The screen is yours again. Take a screenshot to see what changed." };
  }
  return { handedBack: false, state: r.control.state, next: "The person still holds the screen. Call capsulate_wait_for_handback to keep waiting." };
}

/** Guidance the MCP client shows the model: how to work on a screen a person watches. */
export const LIVE_INSTRUCTIONS = [
  "Capsulate gives you isolated cloud computers (capsules). Desktop capsules (templates with 'desktop' in the id) have a screen you drive with screenshot, click, type and key, plus the UI tree (capsulate_ui_tree, capsulate_find_element, capsulate_click_element), which is faster and more exact than reading pixels.",
  "A person can watch a desktop capsule live. Call capsulate_console_link and share or open the URL. While they watch: narrate each step with capsulate_say; prefer capsulate_click_element over guessed coordinates; release the screen with capsulate_control action 'release' when you finish.",
  "When you need the person (a sign in, a CAPTCHA, a payment, a judgement call), call capsulate_handoff with a clear note and wait. Never type passwords, card numbers or other secrets yourself. If an input returns human_in_control, the person holds the screen: call capsulate_wait_for_handback and retry.",
].join("\n");
