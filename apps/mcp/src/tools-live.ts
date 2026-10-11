// Phase LCU — the MCP tools for live computer use: the deep desktop verbs, plus the shared screen a person
// watches (console links), who drives it (control, handoff, wait) and narration (say).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CapsulateError, type Capsulate } from "@capsulate/sdk";

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

// LCU M2.6: an element, window or open action that could not happen is 422 {error: not_found | unsupported |
// failed, message}. Say what to try next instead of a bare error; anything else (a 409 too) is err's.
function notDone(e: unknown, next: Record<string, string>): TextResult | undefined {
  if (!(e instanceof CapsulateError) || e.status !== 422) return undefined;
  const code = e.code ?? "failed";
  const text = `Not done (${code}): ${e.message.replace(/[.\s]+$/, "")}.${next[code] ? ` ${next[code]}` : ""}`;
  return { content: [{ type: "text", text }], isError: true };
}

const ELEMENT_NEXT: Record<string, string> = {
  not_found: "Check the selector with capsulate_find_element or capsulate_ui_tree, or wait for the element with capsulate_wait_for.",
  unsupported: "This element cannot do that: try another action (invoke, toggle, select) or capsulate_click_element.",
  failed: "Take a screenshot to see what the app shows.",
};
const WINDOW_NEXT: Record<string, string> = { not_found: "List the open windows with capsulate_windows." };
const OPEN_NEXT: Record<string, string> = {
  not_found: "For an app, try the name its menu shows (Linux 'Text Editor', Windows 'Notepad'); for a file, the full path.",
};

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
      description: "Without a target, list the open windows of a desktop capsule. With `id` or `title`, bring that window to the front. To minimize, maximize, move, resize or close one, use capsulate_window.",
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

  // ---- the complete toolset (LCU M2.6): act on elements and windows, open things, wait, read the screen ----

  server.registerTool(
    "capsulate_element",
    {
      title: "Act on a UI element",
      description:
        "Act on the accessible element a selector finds, without coordinates: set_value (replace a field's text, or a slider's value, with value), clear, toggle (a check box), expand or collapse (a menu, combo box or tree item), invoke (press a button, follow a link), select (a list item, tab or radio button; with value, the option of that name inside a combo box or list), focus, scroll_into_view. Prefer it to clicking and typing at guessed coordinates: it acts on exactly the element you name. Roles match across systems ('button', 'push button' and 'Button' are the same); a multi-line editor is 'document' on Windows (Notepad) and 'text' on Linux. Returns the element afterwards (its value and states such as checked, expanded, selected).",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["set_value", "clear", "toggle", "expand", "collapse", "invoke", "select", "focus", "scroll_into_view"]),
        ...selectorSchema,
        value: z.string().optional().describe("For set_value, the new text; for select, the name of the option to choose inside the element"),
        window: z.string().optional().describe("Only within the window whose title contains this"),
        index: z.number().optional().describe("Which match when several do (0, the first, in capsulate_find_element's order)"),
      },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.elementAction(a.sessionId, a.action, selectorOf(a), { value: a.value, window: a.window, index: a.index }));
      } catch (e) {
        return notDone(e, ELEMENT_NEXT) ?? err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_window",
    {
      title: "Manage a window",
      description:
        "Minimize, maximize, restore, close, move, resize or focus a window of a desktop capsule, by id (from capsulate_windows) or a part of its title. move takes x, y (the new top-left corner); resize takes w, h (each at least 50). close asks the app to close, as the title bar's close button does, so it may first ask to save. Returns the window afterwards (none after close).",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["minimize", "maximize", "restore", "close", "move", "resize", "focus"]),
        id: z.string().optional().describe("Window id from capsulate_windows"),
        title: z.string().optional().describe("A part of the window's title"),
        x: z.number().optional().describe("For move: the new left edge, in screen pixels"),
        y: z.number().optional().describe("For move: the new top edge"),
        w: z.number().optional().describe("For resize: the new width (at least 50)"),
        h: z.number().optional().describe("For resize: the new height (at least 50)"),
      },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.windowAction(a.sessionId, a.action, { id: a.id, title: a.title }, { x: a.x, y: a.y, w: a.w, h: a.h }));
      } catch (e) {
        return notDone(e, WINDOW_NEXT) ?? err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_open",
    {
      title: "Open a URL, a file or an app",
      description:
        "Open a URL (in the default browser), a file (in its default app) or an app by name on a desktop capsule, instead of hunting through menus. Without kind it is guessed: a path (/, ~, C:\\) is a file, a scheme (https:, mailto:) or www. is a URL, anything else is an app name (a Linux menu entry such as 'Text Editor', a Windows Start menu entry such as 'Notepad', or a program on the path). Pass waitMs to wait for the new window and get it back. For web pages you will read or fill in, capsulate_browser_open is faster and more exact.",
      inputSchema: {
        sessionId: z.string(),
        target: z.string().describe("A URL, a file path or an app name"),
        kind: z.enum(["url", "file", "app"]).optional().describe("Default: guessed from the target"),
        waitMs: z.number().optional().describe("Wait up to this long for the new window and return it (at most 30000)"),
      },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.open(a.sessionId, a.target, { kind: a.kind, waitMs: a.waitMs }));
      } catch (e) {
        return notDone(e, OPEN_NEXT) ?? err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_wait_for",
    {
      title: "Wait for a condition",
      description:
        "Wait in the capsule until a condition holds, instead of sleeping or taking screenshot after screenshot: present (an element matching the selector is there), absent (none is any more: a dialog closed, a spinner went away), enabled (a matching element can be used), text (an element's name or value contains text; the selector is optional), window (a window whose title contains window is open), screen_stable (nothing on screen changed for stableMs: an app or page finished drawing). Returns met (true or false), waitedMs and what matched. The wait never holds up the capsule's other calls.",
      inputSchema: {
        sessionId: z.string(),
        condition: z.enum(["present", "absent", "enabled", "text", "window", "screen_stable"]),
        ...selectorSchema,
        text: z.string().optional().describe("For text: what the name or value must contain. For present, absent and enabled: match the name OR the value"),
        window: z.string().optional().describe("For window: a part of the title to wait for. For the element conditions: only within that window"),
        timeoutMs: z.number().optional().describe("Default 10000, at most 120000"),
        stableMs: z.number().optional().describe("For screen_stable: how long nothing may change (default 600, at most 10000)"),
      },
    },
    async (a) => {
      try {
        const forText = a.condition === "text";
        const sel = selectorOf({ ...a, text: forText ? undefined : a.text });
        return ok(
          await cap.capsules.waitFor(a.sessionId, a.condition, {
            selector: Object.keys(sel).length ? sel : undefined,
            window: a.window,
            text: forText ? a.text : undefined,
            timeoutMs: a.timeoutMs,
            stableMs: a.stableMs,
          }),
        );
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_screen_info",
    {
      title: "Read the screen's size",
      description: "The screen's size in pixels, the pointer's position and the active window of a desktop capsule. Use it instead of a screenshot when that is all you need.",
      inputSchema: { sessionId: z.string() },
    },
    async (a) => {
      try {
        return ok(await cap.capsules.screenInfo(a.sessionId));
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
        "Read or change who drives a desktop capsule's shared screen. state 'free' (nobody), 'agent' (you; every input renews a 45 s hold) or 'human' (a person; your input is refused until they hand it back). action 'status' (default) reads it, 'take' claims it for you, 'release' lets go when you finish so the person can use the screen, 'pace' sets how your input plays while a person watches: 'natural' (the pointer glides, typing is readable) or 'presentation' (slow enough to follow every step); 'fast' is the default. action 'visible' turns visible mode on or off (when the person asks to see every step). The status says visible: true while it is on: then do every step on the screen instead of through commands.",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["status", "take", "release", "pace", "visible"]).optional(),
        note: z.string().optional().describe("Optional note shown on the console"),
        pace: z.enum(["fast", "natural", "presentation"]).optional().describe("For action 'pace'"),
        visible: z.boolean().optional().describe("For action 'visible'"),
      },
    },
    async (a) => {
      try {
        const st =
          a.action === "take"
            ? await cap.capsules.takeControl(a.sessionId, { note: a.note })
            : a.action === "release"
              ? await cap.capsules.releaseControl(a.sessionId, { note: a.note })
              : a.action === "pace"
                ? await cap.capsules.setPace(a.sessionId, a.pace ?? "natural")
                : a.action === "visible"
                  ? await cap.capsules.setVisible(a.sessionId, a.visible ?? true)
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

/** Guidance the MCP client shows the model first (Phase HYB): commands first, the screen when it matters. */
export const WORK_INSTRUCTIONS = [
  "Work through commands first: files, installs, settings, scripts and data go through capsulate_exec, capsulate_write_file, capsulate_read_file and capsulate_run_code. Each is one call and a fraction of a second, where the same work on the screen takes many steps and a look before each. Use the screen for what has no command route (an app's own window), for what the person must see, and for handoffs.",
  "On Windows, run PowerShell: capsulate_exec with ['powershell.exe', '-Command', '<script>'] or capsulate_run_code with lang 'powershell'.",
  "Check capsulate_control before a task on a desktop capsule: visible: true means the person wants to watch the whole task, so do every step on the screen. While someone watches and you work off the screen, say what you are doing with capsulate_say.",
].join("\n");

/** Guidance the MCP client shows the model: how to work on a screen a person watches. */
export const LIVE_INSTRUCTIONS = [
  "Capsulate gives you isolated cloud computers (capsules). Desktop capsules (templates with 'desktop' in the id) have a screen you drive with screenshot, click, type and key, plus the UI tree (capsulate_ui_tree, capsulate_find_element, capsulate_click_element, capsulate_element), which is faster and more exact than reading pixels. Start apps, files and URLs with capsulate_open, manage windows with capsulate_window, and wait with capsulate_wait_for instead of sleeping.",
  "A person can watch a desktop capsule live. Call capsulate_console_link and share or open the URL. While they watch: narrate each step with capsulate_say; prefer capsulate_click_element and capsulate_element over guessed coordinates; release the screen with capsulate_control action 'release' when you finish.",
  "When you need the person (a sign in, a CAPTCHA, a payment, a judgement call), call capsulate_handoff with a clear note and wait. Never type passwords, card numbers or other secrets yourself. If an input returns human_in_control, the person holds the screen: call capsulate_wait_for_handback and retry.",
].join("\n");
