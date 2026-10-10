// @capsulate/ai-tools: drop-in sandbox tools for AI agent frameworks.
//
// One set of tool specs (name + description + zod schema + execute), built on
// @capsulate/sdk, adapted to each framework's tool shape:
//   • Vercel AI SDK   → `capsulateTools(cap)`        (use directly as `tools`; v4 and v5)
//   • LangChain (JS)  → `capsulateLangChainSpecs(cap)` (wrap each in DynamicStructuredTool)
//   • LlamaIndex/CrewAI/others → `capsulateToolSpecs(cap)` (generic spec; adapt trivially)
//
// The zod schema is exposed under BOTH names the Vercel AI SDK has used: `parameters`
// (AI SDK v4) and `inputSchema` (AI SDK v5). Same object, so either major accepts the
// tools unchanged; `maxSteps` (v4) became `stopWhen: stepCountIs(n)` in v5 on your side.
//
// Zero framework dependencies: it only needs @capsulate/sdk + zod, so it builds
// anywhere; you bring your own framework. See the README for per-framework one-liners.

import { z, type ZodTypeAny } from "zod";
import { Capsulate, CapsulateError, type CapsulateOptions } from "@capsulate/sdk";

export interface ToolSpec<P extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  /** The input schema (zod). AI SDK v4 name. */
  parameters: P;
  /** The same input schema (zod). AI SDK v5 name. */
  inputSchema: P;
  execute: (args: z.infer<P>) => Promise<unknown>;
}

/** An element, window or open action that could not happen (422: not_found, unsupported or failed) is an answer the
 *  model can act on, like click_element's "element not found": return it instead of throwing. */
async function orNotDone<T>(p: Promise<T>): Promise<T | { ok: false; error: string; message: string }> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof CapsulateError && e.status === 422) return { ok: false, error: e.code ?? "failed", message: e.message };
    throw e;
  }
}

/** Build the Capsulate agent tool specs bound to a client (or client options). */
export function capsulateToolSpecs(clientOrOpts: Capsulate | CapsulateOptions): ToolSpec[] {
  const cap = clientOrOpts instanceof Capsulate ? clientOrOpts : new Capsulate(clientOrOpts);

  const specs: Omit<ToolSpec, "inputSchema">[] = [
    {
      name: "capsulate_launch_capsule",
      description:
        "Launch a new isolated cloud sandbox (capsule) from a template and wait until it is ready. Returns the sessionId to use with other tools.",
      parameters: z.object({
        template: z.string().describe("Template/OS id, e.g. 'ubuntu-22.04-headless'"),
        size: z.string().optional().describe("Resource size, default '2c4g'"),
      }),
      execute: async ({ template, size }) => {
        const c = await cap.capsules.launch({ template, size: size ?? "2c4g" });
        return { sessionId: c.id, status: c.status };
      },
    },
    {
      name: "capsulate_run_code",
      description: "Run a snippet of code (python/node/bash) inside a capsule. Returns stdout, stderr, exit code.",
      parameters: z.object({
        sessionId: z.string(),
        code: z.string(),
        lang: z.enum(["python", "node", "bash"]).optional(),
      }),
      execute: async ({ sessionId, code, lang }) => {
        const r = await cap.capsules.run(sessionId, code, { lang: lang ?? "bash" });
        return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
      },
    },
    {
      name: "capsulate_exec",
      description:
        "Run a shell command (as an argv array) inside a capsule. Returns stdout, stderr, exit code. On a Linux desktop capsule it runs as the desktop user 'capsulate' (home folder, DISPLAY :1); prefix 'sudo' for root.",
      parameters: z.object({
        sessionId: z.string(),
        command: z.array(z.string()).describe("argv array, e.g. ['ls','-la']"),
      }),
      execute: async ({ sessionId, command }) => {
        const r = await cap.capsules.exec(sessionId, command);
        return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
      },
    },
    {
      name: "capsulate_write_file",
      description: "Write a UTF-8 text file inside a capsule.",
      parameters: z.object({ sessionId: z.string(), path: z.string(), content: z.string() }),
      execute: async ({ sessionId, path, content }) => {
        await cap.capsules.writeFile(sessionId, path, content);
        return { ok: true, path };
      },
    },
    {
      name: "capsulate_read_file",
      description: "Read a UTF-8 text file from inside a capsule.",
      parameters: z.object({ sessionId: z.string(), path: z.string() }),
      execute: async ({ sessionId, path }) => {
        return { content: await cap.capsules.readFileText(sessionId, path) };
      },
    },
    // ── deep computer-use (Phase CU): drive a real desktop reliably ──
    {
      name: "capsulate_screenshot",
      description:
        "Take a screenshot of a desktop capsule's screen. Returns a base64 image (PNG unless format is 'jpeg') plus its width/height. Use to see the screen before acting. For fewer bytes ask for format 'jpeg', a scale such as 0.5, or a region (x, y, w, h); then a point (x, y) in the image is at (region.x + x / scale, region.y + y / scale) on the screen, and clicks take screen pixels.",
      parameters: z.object({
        sessionId: z.string(),
        format: z.enum(["png", "jpeg"]).optional().describe("png (default) or jpeg (smaller)"),
        quality: z.number().optional().describe("JPEG quality, 1 to 100 (default 75)"),
        scale: z.number().optional().describe("shrink to this fraction of the screen, 0.1 to 1"),
        x: z.number().optional().describe("region: left edge in screen pixels"),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      }),
      execute: async ({ sessionId, format, quality, scale, x, y, w, h }) => {
        const s = await cap.capsules.screenshot(sessionId, { format, quality, scale, x, y, w, h });
        return { imageB64: s.imageB64, width: s.width, height: s.height, format: s.format, scale: s.scale, region: s.region };
      },
    },
    {
      name: "capsulate_ui_tree",
      description:
        "Get the desktop's accessibility tree (real UI elements with role, name, value, on-screen bounds and states), far more reliable than guessing pixel coordinates. Set interesting=true for just the actionable/labelled elements.",
      parameters: z.object({
        sessionId: z.string(),
        interesting: z.boolean().optional().describe("only actionable/labelled elements (default true)"),
        window: z.string().optional().describe("limit to a window whose title contains this"),
        maxDepth: z.number().optional(),
      }),
      execute: async ({ sessionId, interesting, window, maxDepth }) => {
        return cap.capsules.uiTree(sessionId, { interesting: interesting ?? true, window, maxDepth });
      },
    },
    {
      name: "capsulate_find_element",
      description:
        "Find UI elements on the desktop matching a selector (any of role/name/text/state). Each match has a click-ready center (cx, cy). Prefer this over pixel hunting.",
      parameters: z.object({
        sessionId: z.string(),
        role: z.string().optional().describe("e.g. button, text, menu item, link"),
        name: z.string().optional().describe("accessible name / label"),
        text: z.string().optional().describe("match against name OR value"),
        exact: z.boolean().optional(),
        state: z.string().optional().describe("e.g. enabled, visible, focused"),
        limit: z.number().optional(),
      }),
      execute: async ({ sessionId, role, name, text, exact, state, limit }) => {
        return cap.capsules.findElement(sessionId, { role, name, text, exact, state }, { limit });
      },
    },
    {
      name: "capsulate_click_element",
      description:
        "Find a UI element by role/name/text and click its center. The reliable way to 'click the Save button' without coordinates. Returns the element clicked.",
      parameters: z.object({
        sessionId: z.string(),
        role: z.string().optional(),
        name: z.string().optional(),
        text: z.string().optional(),
        button: z.enum(["left", "right", "middle"]).optional(),
        count: z.number().optional(),
        waitMs: z.number().optional().describe("wait up to this long for the element to appear"),
      }),
      execute: async ({ sessionId, role, name, text, button, count, waitMs }) => {
        const sel = { role, name, text };
        let el;
        if (waitMs && waitMs > 0) {
          const w = await cap.capsules.waitElement(sessionId, sel, { timeoutMs: waitMs });
          if (!w.found || !w.element) return { ok: false, error: "element not found" };
          el = w.element;
        } else {
          const r = await cap.capsules.findElement(sessionId, sel, { limit: 1 });
          if (r.backend === "none") return { ok: false, error: "no accessibility backend" };
          if (!r.matches.length) return { ok: false, error: "element not found" };
          el = r.matches[0];
        }
        await cap.capsules.click(sessionId, el.cx, el.cy, { button, count });
        return { ok: true, clicked: { role: el.role, name: el.name, cx: el.cx, cy: el.cy } };
      },
    },
    {
      name: "capsulate_type_text",
      description: "Type literal text into the focused field of a desktop capsule.",
      parameters: z.object({ sessionId: z.string(), text: z.string() }),
      execute: async ({ sessionId, text }) => {
        await cap.capsules.type(sessionId, text);
        return { ok: true };
      },
    },
    {
      name: "capsulate_press_keys",
      description:
        "Press keys on a desktop capsule, in order. Each entry is one key or a '+'-joined chord: ['ctrl+c'] copies, ['ctrl+l', 'Return'] focuses then submits. A bare modifier followed by a key is joined into a chord, so ['ctrl','c'] also copies.",
      parameters: z.object({ sessionId: z.string(), keys: z.array(z.string()) }),
      execute: async ({ sessionId, keys }) => {
        await cap.capsules.key(sessionId, keys);
        return { ok: true };
      },
    },
    {
      name: "capsulate_wait_element",
      description: "Wait until a UI element matching the selector appears (or the timeout). Use after an action that should change the screen.",
      parameters: z.object({
        sessionId: z.string(),
        role: z.string().optional(),
        name: z.string().optional(),
        text: z.string().optional(),
        timeoutMs: z.number().optional(),
      }),
      execute: async ({ sessionId, role, name, text, timeoutMs }) => {
        return cap.capsules.waitElement(sessionId, { role, name, text }, { timeoutMs });
      },
    },
    {
      name: "capsulate_ocr",
      description:
        "Recognize on-screen text via OCR (full screen or a region). Use for text the accessibility tree does not expose (e.g. canvas, images).",
      parameters: z.object({
        sessionId: z.string(),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      }),
      execute: async ({ sessionId, x, y, w, h }) => {
        const r = await cap.capsules.ocr(sessionId, { x, y, w, h });
        return { text: r.text, backend: r.backend, wordCount: r.words?.length ?? 0 };
      },
    },
    {
      name: "capsulate_clipboard",
      description: "Read or write the desktop clipboard. Provide `text` to set it; omit to get it.",
      parameters: z.object({ sessionId: z.string(), text: z.string().optional() }),
      execute: async ({ sessionId, text }) => {
        if (typeof text === "string") {
          await cap.capsules.clipboardSet(sessionId, text);
          return { ok: true };
        }
        return cap.capsules.clipboardGet(sessionId);
      },
    },
    {
      name: "capsulate_checkpoint",
      description:
        "Checkpoint (snapshot) a capsule's current state before a risky action, so you can roll back. Returns a checkpointId.",
      parameters: z.object({ sessionId: z.string(), name: z.string().optional() }),
      execute: async ({ sessionId, name }) => {
        const snap = await cap.capsules.snapshots.create(sessionId, name);
        return { checkpointId: snap.id };
      },
    },
    {
      name: "capsulate_rollback",
      description:
        "Roll back to a checkpoint: launches a fresh capsule cloned from the snapshot and (by default) destroys the current one. Returns the NEW sessionId, so use it from now on.",
      parameters: z.object({
        sessionId: z.string(),
        checkpointId: z.string(),
        destroyCurrent: z.boolean().optional(),
      }),
      execute: async ({ sessionId, checkpointId, destroyCurrent }) => {
        const c = await cap.capsules.get(sessionId);
        const restored = await c.rollback(checkpointId, { destroyCurrent });
        return { sessionId: restored.id, status: restored.status };
      },
    },
    {
      name: "capsulate_get_trace",
      description:
        "Get the structured action trace for this run (every interaction in order). Use to verify/summarize what was done, and pairs with the recording for a provable report.",
      parameters: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => {
        const t = await cap.capsules.trace(sessionId);
        return { count: t.count, events: t.events };
      },
    },
    // ---- live computer use (Phase LCU): a person watches the same screen and can take turns ----
    {
      name: "capsulate_console_link",
      description:
        "Get a signed, expiring URL that opens a desktop capsule's LIVE screen in any browser with no login. The viewer sees your pointer, clicks and keys and your narration. mode 'control' (default) lets them take the screen and hand it back; 'view' only watches.",
      parameters: z.object({
        sessionId: z.string(),
        mode: z.enum(["control", "view"]).optional(),
        ttlMinutes: z.number().optional().describe("Lifetime in minutes (default 240, max 1440)"),
      }),
      execute: async ({ sessionId, mode, ttlMinutes }) => {
        const l = await cap.capsules.consoleLink(sessionId, { mode, ttlSec: ttlMinutes ? Math.round(ttlMinutes * 60) : undefined });
        return { url: l.url, mode: l.mode, expiresAt: l.expiresAt };
      },
    },
    {
      name: "capsulate_say",
      description: "Show one short line of narration on a desktop capsule's live console, so the person watching knows what you are doing.",
      parameters: z.object({ sessionId: z.string(), text: z.string() }),
      execute: async ({ sessionId, text }) => {
        await cap.capsules.say(sessionId, text);
        return { ok: true };
      },
    },
    {
      name: "capsulate_handoff",
      description:
        "Hand a desktop capsule's screen to the person watching, with a note saying what you need (a sign in, a CAPTCHA, a payment, a check). Waits until they press Done, hand back, and returns their note. Never type passwords or secrets yourself; hand over instead.",
      parameters: z.object({
        sessionId: z.string(),
        note: z.string(),
        waitSeconds: z.number().optional().describe("How long to wait for the hand back (default 300, max 900)"),
      }),
      execute: async ({ sessionId, note, waitSeconds }) => {
        const wait = Math.max(1, Math.min(waitSeconds ?? 300, 900));
        const r = await cap.capsules.handoff(sessionId, note, { timeoutMs: wait * 1000 });
        return { handedBack: r.handedBack, note: r.note ?? null, state: r.control.state };
      },
    },
    {
      name: "capsulate_control",
      description:
        "Read or change who drives a desktop capsule's screen: 'free', 'agent' (you) or 'human' (a person; your input is refused until they hand it back). action 'status' (default), 'take', 'release' when you finish, or 'pace' to set how your input plays while a person watches: 'natural' or 'presentation' ('fast' is the default).",
      parameters: z.object({
        sessionId: z.string(),
        action: z.enum(["status", "take", "release", "pace"]).optional(),
        pace: z.enum(["fast", "natural", "presentation"]).optional(),
      }),
      execute: async ({ sessionId, action, pace }) => {
        if (action === "take") return cap.capsules.takeControl(sessionId);
        if (action === "release") return cap.capsules.releaseControl(sessionId);
        if (action === "pace") return cap.capsules.setPace(sessionId, pace ?? "natural");
        return cap.capsules.control(sessionId);
      },
    },
    {
      name: "capsulate_destroy_capsule",
      description: "Destroy a capsule and release its resources when finished.",
      parameters: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => {
        await cap.capsules.destroy(sessionId);
        return { ok: true };
      },
    },
    {
      name: "capsulate_list_capsules",
      description: "List the team's active capsules.",
      parameters: z.object({}),
      execute: async () => {
        const list = await cap.capsules.list();
        return list.map((c: { sessionId: string; status: string; templateId?: string }) => ({
          sessionId: c.sessionId,
          status: c.status,
          template: c.templateId,
        }));
      },
    },
    // ---- the browser fast path (LCU M2): the agent's own Chrome, read as text with refs, acted on at page speed ----
    {
      name: "capsulate_browser_open",
      description:
        "Open the agent's own Chrome on a desktop capsule (a person watching sees it) and optionally load a url. For web pages prefer the capsulate_browser_* tools: exact and far faster than screenshots and clicks.",
      parameters: z.object({ sessionId: z.string(), url: z.string().optional() }),
      execute: async ({ sessionId, url }) => cap.capsules.browser(sessionId).open(url),
    },
    {
      name: "capsulate_browser_snapshot",
      description:
        "Read the current page as a list of elements with refs (e.g. e12, link, 'Pricing'). Act on them by ref with the other browser tools; take a new snapshot after the page changes.",
      parameters: z.object({
        sessionId: z.string(),
        interactive: z.boolean().optional().describe("only elements you can click or type into"),
        max: z.number().optional(),
      }),
      execute: async ({ sessionId, interactive, max }) => cap.capsules.browser(sessionId).snapshot({ interactive, max }),
    },
    {
      name: "capsulate_browser_click",
      description: "Click an element of the page by ref (from capsulate_browser_snapshot), CSS selector or visible text.",
      parameters: z.object({ sessionId: z.string(), ref: z.string().optional(), selector: z.string().optional(), text: z.string().optional() }),
      execute: async ({ sessionId, ref, selector, text }) => cap.capsules.browser(sessionId).click({ ref, selector, text }),
    },
    {
      name: "capsulate_browser_fill",
      description: "Type a value into a page field (replacing it); submit presses Enter. Never for passwords or card numbers.",
      parameters: z.object({
        sessionId: z.string(),
        ref: z.string().optional(),
        selector: z.string().optional(),
        text: z.string().optional(),
        value: z.string(),
        submit: z.boolean().optional(),
      }),
      execute: async ({ sessionId, ref, selector, text, value, submit }) =>
        cap.capsules.browser(sessionId).fill({ ref, selector, text }, value, { submit }),
    },
    {
      name: "capsulate_browser_wait",
      description: "Wait until an element or text appears in the page (state 'hidden': until it goes away).",
      parameters: z.object({
        sessionId: z.string(),
        ref: z.string().optional(),
        selector: z.string().optional(),
        text: z.string().optional(),
        state: z.enum(["visible", "hidden"]).optional(),
        timeoutMs: z.number().optional(),
      }),
      execute: async ({ sessionId, ref, selector, text, state, timeoutMs }) =>
        cap.capsules.browser(sessionId).wait({ ref, selector, text }, { state, timeoutMs }),
    },
    {
      name: "capsulate_browser_text",
      description: "The page's visible text, or one element's.",
      parameters: z.object({ sessionId: z.string(), ref: z.string().optional(), selector: z.string().optional(), max: z.number().optional() }),
      execute: async ({ sessionId, ref, selector, max }) => cap.capsules.browser(sessionId).text({ ref, selector }, { max }),
    },
    // ---- the complete toolset (LCU M2.6): act on elements and windows, open things, wait, read the screen ----
    {
      name: "capsulate_element",
      description:
        "Act on the UI element a selector finds, without coordinates: set_value (replace a field's text with value), clear, toggle (a check box), expand or collapse (a menu, combo box or tree item), invoke (press a button, follow a link), select (a list item or tab; with value, the option of that name inside a combo box or list), focus, scroll_into_view. More reliable than clicking and typing at guessed pixels. Roles match across systems; a multi-line editor is 'document' on Windows, 'text' on Linux. Returns the element afterwards (value, states such as checked or expanded), or ok false with error not_found or unsupported.",
      parameters: z.object({
        sessionId: z.string(),
        action: z.enum(["set_value", "clear", "toggle", "expand", "collapse", "invoke", "select", "focus", "scroll_into_view"]),
        role: z.string().optional().describe("e.g. button, text, check box, combo box"),
        name: z.string().optional().describe("accessible name / label"),
        text: z.string().optional().describe("match against name OR value"),
        exact: z.boolean().optional(),
        state: z.string().optional().describe("e.g. enabled, visible, focused"),
        value: z.string().optional().describe("set_value: the new text; select: the option to choose inside the element"),
        window: z.string().optional().describe("only within a window whose title contains this"),
        index: z.number().optional().describe("which match when several do (0 = the first)"),
      }),
      execute: async ({ sessionId, action, role, name, text, exact, state, value, window, index }) =>
        orNotDone(cap.capsules.elementAction(sessionId, action, { role, name, text, exact, state }, { value, window, index })),
    },
    {
      name: "capsulate_window",
      description:
        "Minimize, maximize, restore, close, move ({x, y}: the new top-left corner), resize ({w, h}: at least 50) or focus a window, by a part of its title or by id (capsulate_screen_info gives the active window's). close asks the app to close, so it may first ask to save. Returns the window afterwards (none after close).",
      parameters: z.object({
        sessionId: z.string(),
        action: z.enum(["minimize", "maximize", "restore", "close", "move", "resize", "focus"]),
        id: z.string().optional(),
        title: z.string().optional().describe("a part of the window's title"),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().optional(),
        h: z.number().optional(),
      }),
      execute: async ({ sessionId, action, id, title, x, y, w, h }) =>
        orNotDone(cap.capsules.windowAction(sessionId, action, { id, title }, { x, y, w, h })),
    },
    {
      name: "capsulate_open",
      description:
        "Open a URL (default browser), a file (its default app) or an app by name on a desktop capsule, instead of hunting through menus. The kind is guessed unless given: a path is a file, a scheme (https:) or www. is a URL, anything else an app name ('Text Editor' or 'Mousepad' on Linux, 'Notepad' on Windows, or a program on the path). waitMs waits for the new window and returns it.",
      parameters: z.object({
        sessionId: z.string(),
        target: z.string().describe("a URL, a file path or an app name"),
        kind: z.enum(["url", "file", "app"]).optional(),
        waitMs: z.number().optional().describe("wait up to this long for the new window (at most 30000)"),
      }),
      execute: async ({ sessionId, target, kind, waitMs }) => orNotDone(cap.capsules.open(sessionId, target, { kind, waitMs })),
    },
    {
      name: "capsulate_wait_for",
      description:
        "Wait in the capsule until a condition holds, instead of sleeping: present (an element matching the selector is there), absent (none is any more: a dialog closed), enabled (a matching element can be used), text (an element's name or value contains text), window (a window whose title contains window is open), screen_stable (nothing on screen changed for stableMs). Returns met (true or false) and waitedMs.",
      parameters: z.object({
        sessionId: z.string(),
        condition: z.enum(["present", "absent", "enabled", "text", "window", "screen_stable"]),
        role: z.string().optional(),
        name: z.string().optional(),
        text: z.string().optional().describe("text: what the name or value must contain; present, absent, enabled: match name OR value"),
        exact: z.boolean().optional(),
        state: z.string().optional(),
        window: z.string().optional().describe("window: the title to wait for; otherwise only within that window"),
        timeoutMs: z.number().optional().describe("default 10000, at most 120000"),
        stableMs: z.number().optional().describe("screen_stable: how long nothing may change (default 600)"),
      }),
      execute: async ({ sessionId, condition, role, name, text, exact, state, window, timeoutMs, stableMs }) => {
        const forText = condition === "text";
        const sel = { role, name, text: forText ? undefined : text, exact, state };
        const hasSel = Object.values(sel).some((v) => v !== undefined);
        return cap.capsules.waitFor(sessionId, condition, {
          selector: hasSel ? sel : undefined,
          window,
          text: forText ? text : undefined,
          timeoutMs,
          stableMs,
        });
      },
    },
    {
      name: "capsulate_screen_info",
      description: "The screen's size, the pointer's position and the active window of a desktop capsule (cheaper than a screenshot).",
      parameters: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => cap.capsules.screenInfo(sessionId),
    },
    // ---- several steps in one call (LCU M2.4) ----
    {
      name: "capsulate_run_actions",
      description:
        "Run a list of steps on a desktop capsule in ONE call, back to back; the run stops at the first step that fails. Prefer it over one call per step when you know what comes next. " +
        "Each step is {do: verb, ...fields}: click {x, y}, type {text}, key {keys}, move, scroll, drag, screenshot, ui_tree, find_element {selector}, wait_element {selector, timeoutMs}, clipboard, clipboard_set {text}, windows, window_focus {title}, ocr; " +
        "element {action, selector, value?} (set_value, toggle, expand, invoke, select, ...), window {action, title | id} (minimize, maximize, move, resize, close, ...), open {target, waitMs?}, wait_for {condition, selector?, text?, window?, timeoutMs?} (a wait that ends unmet fails the step), screen; " +
        "the browser as browser_<verb> (browser_navigate {url}, browser_click {ref | text}, browser_fill {ref, value}, browser_wait {text}, browser_snapshot, ...); " +
        "click_element {selector: {role?, name?, text?}} (find, waiting up to 5 s, then click), say {text}, pause {ms}. " +
        "expect on a step is a wait that must succeed after it; optional: true lets a step fail. observe returns a look at the end: 'screenshot', 'ui_tree' or 'browser_snapshot'.",
      parameters: z.object({
        sessionId: z.string(),
        steps: z.array(z.object({ do: z.string() }).passthrough()).min(1).max(50),
        observe: z.enum(["none", "screenshot", "ui_tree", "browser_snapshot"]).optional(),
      }),
      execute: async ({ sessionId, steps, observe }) => cap.capsules.runActions(sessionId, steps, { observe }),
    },
  ];
  return specs.map((s) => ({ ...s, inputSchema: s.parameters }));
}

/** One Vercel AI SDK tool: the shape both AI SDK v4 (`parameters`) and v5 (`inputSchema`) accept. */
export interface CapsulateTool {
  description: string;
  /** The input schema (zod). AI SDK v4 reads this. */
  parameters: ZodTypeAny;
  /** The same input schema (zod). AI SDK v5 reads this. */
  inputSchema: ZodTypeAny;
  execute: (args: any) => Promise<unknown>;
}

/**
 * Vercel AI SDK adapter. The returned record plugs straight into `generateText({ tools })`:
 * each value is `{ description, parameters, inputSchema, execute }`, so it works with
 * AI SDK v4 (reads `parameters`, loops with `maxSteps`) and AI SDK v5 (reads `inputSchema`,
 * loops with `stopWhen: stepCountIs(n)`).
 *
 *   import { generateText, stepCountIs } from "ai";
 *   import { capsulateTools } from "@capsulate/ai-tools";
 *   const tools = capsulateTools({ apiKey: process.env.CAPSULATE_API_KEY });
 *   await generateText({ model, prompt, tools, stopWhen: stepCountIs(8) }); // v5
 *   await generateText({ model, prompt, tools, maxSteps: 8 });              // v4
 */
export function capsulateTools(clientOrOpts: Capsulate | CapsulateOptions): Record<string, CapsulateTool> {
  const out: Record<string, CapsulateTool> = {};
  for (const s of capsulateToolSpecs(clientOrOpts)) {
    out[s.name] = { description: s.description, parameters: s.parameters, inputSchema: s.parameters, execute: s.execute };
  }
  return out;
}

/**
 * LangChain (JS) adapter specs. Wrap each in a DynamicStructuredTool:
 *
 *   import { DynamicStructuredTool } from "@langchain/core/tools";
 *   import { capsulateLangChainSpecs } from "@capsulate/ai-tools";
 *   const tools = capsulateLangChainSpecs({ apiKey }).map((s) => new DynamicStructuredTool(s));
 */
export function capsulateLangChainSpecs(clientOrOpts: Capsulate | CapsulateOptions): Array<{
  name: string;
  description: string;
  schema: ZodTypeAny;
  func: (args: any) => Promise<string>;
}> {
  return capsulateToolSpecs(clientOrOpts).map((s) => ({
    name: s.name,
    description: s.description,
    schema: s.parameters,
    func: async (args: any) => JSON.stringify(await s.execute(args)),
  }));
}

export { Capsulate } from "@capsulate/sdk";
