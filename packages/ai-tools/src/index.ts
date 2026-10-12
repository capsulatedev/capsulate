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

/**
 * How to work in a capsule (Phase HYB): put it in your agent's system prompt next to the tools. The same guidance the
 * Capsulate MCP server gives its clients.
 */
export const CAPSULATE_GUIDANCE = [
  "Work through commands first: files, installs, settings, scripts and data go through capsulate_exec, capsulate_write_file, capsulate_read_file and capsulate_run_code (one call, a fraction of a second). Use the screen for what has no command route (an app's own window), for what the person must see, and for handoffs.",
  "On Windows, run PowerShell: capsulate_exec with ['powershell.exe', '-Command', '<script>'] or capsulate_run_code with lang 'powershell'.",
  "Read capsulate_control first: when visible is true, the person wants to watch the whole task, so do every step on the screen.",
  "Its care says how carefully to check your work. care 'quick': plan the whole job, then send it in as few capsulate_run_actions calls as you can (up to 200 steps each) without looking between them; look at the screen only to learn what you cannot know in advance or when a step failed. care 'careful': look after every step and fix a mistake before going on. No care (balanced): look when a step matters.",
  "While a person watches and you work off the screen, say what you are doing with capsulate_say.",
  "Skills are what you or a person taught Capsulate before: how to use an application (where things are, the steps that work, the traps) or how an expert works. Before a task in an application, list the team's skills (capsulate_skills action 'list', with a query) and read the one that fits (action 'get'): follow its instructions, reuse its procedures and avoid its traps instead of discovering the application again.",
  "When you learned something worth keeping (an application's layout, steps you repeated, a trap you hit and how you got past it), save it (capsulate_skills action 'save'): a name and a description that says when to use it, instructions in plain words, procedures with the steps as run_actions steps using {{param}} placeholders, and traps with their fix. A new skill's first version is current; a later version is proposed until the owner approves it. Never put passwords, keys or personal data in a skill.",
  "To learn an application: start a lesson (capsulate_lesson action 'start', mode 'ai', a goal), explore toward the goal, add a note whenever you learn something or get past a trap, then finish it, read its digest (action 'get') and save the skill (capsulate_skills action 'save').",
  "To use a skill: launch its environment (capsulate_launch_capsule with skill), then run its procedure with capsulate_skill_run (in the background, no time limit; it asks you only where the skill leaves a decision open), or call procedures from capsulate_run_actions with {do: 'use', procedure, args}. When a run waits for help, look at the screen and continue it: retry, skip, or the steps that work instead (kept as a proposed fix).",
].join("\n");

/** Build the Capsulate agent tool specs bound to a client (or client options). */
export function capsulateToolSpecs(clientOrOpts: Capsulate | CapsulateOptions): ToolSpec[] {
  const cap = clientOrOpts instanceof Capsulate ? clientOrOpts : new Capsulate(clientOrOpts);

  const specs: Omit<ToolSpec, "inputSchema">[] = [
    {
      name: "capsulate_launch_capsule",
      description:
        "Launch a new isolated cloud sandbox (capsule) from a template and wait until it is ready. Returns the sessionId to use with other tools. " +
        "With skill, the capsule is the skill's environment (its saved template with the software set up) and the skill's setup procedure has run.",
      parameters: z.object({
        template: z.string().optional().describe("Template/OS id, e.g. 'ubuntu-22.04-headless' (not needed with skill)"),
        size: z.string().optional().describe("Resource size, default '2c4g' (or the skill's)"),
        skill: z.string().optional().describe("Launch a skill's environment and run its setup"),
      }),
      execute: async ({ template, size, skill }) => {
        if (!template && !skill) return { ok: false, error: "bad_request", message: "give template, or skill" };
        const c = await cap.capsules.launch({ template, size: size ?? (skill ? undefined : "2c4g"), skill });
        return { sessionId: c.id, status: c.status, ...(c.data.skill ? { skill: c.data.skill } : {}) };
      },
    },
    {
      name: "capsulate_run_code",
      description:
        "Run a snippet of code inside a capsule (python, node or bash on Linux; powershell on Windows, about 0.3 s). Returns stdout, stderr, exit code. Faster than doing the same on the screen.",
      parameters: z.object({
        sessionId: z.string(),
        code: z.string(),
        lang: z.enum(["python", "node", "bash", "powershell"]).optional(),
      }),
      execute: async ({ sessionId, code, lang }) => {
        const r = await cap.capsules.run(sessionId, code, { lang: lang ?? "bash" });
        return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
      },
    },
    {
      name: "capsulate_exec",
      description:
        "Run a command (as an argv array) inside a capsule. Returns stdout, stderr, exit code. Commands first: files, installs, settings, scripts and data are one call here, a fraction of a second, where the screen takes many steps. On a Linux desktop capsule it runs as the desktop user 'capsulate' (home folder, DISPLAY :1); prefix 'sudo' for root. On Windows pass ['powershell.exe', '-Command', '<script>']: it runs in the desktop session's PowerShell, about 0.3 s. It works while a person holds the screen.",
      parameters: z.object({
        sessionId: z.string(),
        command: z.array(z.string()).describe("argv array, e.g. ['ls','-la']"),
        cwd: z.string().optional().describe("Working directory"),
      }),
      execute: async ({ sessionId, command, cwd }) => {
        const r = await cap.capsules.exec(sessionId, command, cwd ? { cwd } : {});
        return { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
      },
    },
    {
      name: "capsulate_write_file",
      description:
        "Write a UTF-8 text file inside a capsule (the folder is created). One call, far faster than typing it into an editor on the screen; open it afterwards with capsulate_open if the person should see it.",
      parameters: z.object({ sessionId: z.string(), path: z.string(), content: z.string() }),
      execute: async ({ sessionId, path, content }) => {
        await cap.capsules.writeFile(sessionId, path, content);
        return { ok: true, path };
      },
    },
    {
      name: "capsulate_read_file",
      description: "Read a UTF-8 text file from inside a capsule. One call, no screen needed.",
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
        "Read or change who drives a desktop capsule's screen: 'free', 'agent' (you) or 'human' (a person; your input is refused until they hand it back). action 'status' (default), 'take', 'release' when you finish, 'pace' to set how your input plays while a person watches: 'natural' or 'presentation' ('fast' is the default), 'visible' to turn visible mode on or off, or 'care' to set how carefully you check your work ('quick', 'balanced', 'careful'). The status says visible: true when the person wants to watch the whole task: then do every step on the screen instead of through commands; it says care when it is not balanced.",
      parameters: z.object({
        sessionId: z.string(),
        action: z.enum(["status", "take", "release", "pace", "visible", "care"]).optional(),
        pace: z.enum(["fast", "natural", "presentation"]).optional(),
        visible: z.boolean().optional().describe("For action 'visible'"),
        care: z.enum(["quick", "balanced", "careful"]).optional().describe("For action 'care'"),
      }),
      execute: async ({ sessionId, action, pace, visible, care }) => {
        if (action === "take") return cap.capsules.takeControl(sessionId);
        if (action === "release") return cap.capsules.releaseControl(sessionId);
        if (action === "pace") return cap.capsules.setPace(sessionId, pace ?? "natural");
        if (action === "visible") return cap.capsules.setVisible(sessionId, visible ?? true);
        if (action === "care") return cap.capsules.setCare(sessionId, care ?? "balanced");
        return cap.capsules.control(sessionId);
      },
    },
    {
      name: "capsulate_drag",
      description:
        "Press at (x1, y1), drag to (x2, y2) and release on a desktop capsule's screen; or draw along a path of [x, y] points (at most 1000) for curves, circles and any shape a hand draws. smooth draws a curve through the points, closed returns to the first point (eight points on a circle make a circle), stepMs is the pause between points (8 ms by default). The button is honoured.",
      parameters: z.object({
        sessionId: z.string(),
        x1: z.number().optional(),
        y1: z.number().optional(),
        x2: z.number().optional(),
        y2: z.number().optional(),
        path: z.array(z.tuple([z.number(), z.number()])).min(2).max(1000).optional(),
        smooth: z.boolean().optional(),
        closed: z.boolean().optional(),
        stepMs: z.number().min(0).max(100).optional(),
        button: z.enum(["left", "right", "middle"]).optional(),
      }),
      execute: async ({ sessionId, x1, y1, x2, y2, path, smooth, closed, stepMs, button }) => {
        if (path) return cap.capsules.stroke(sessionId, path as Array<[number, number]>, { smooth, closed, stepMs, button });
        if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
          return { ok: false, error: "bad_request", message: "Give x1, y1, x2 and y2, or a path of [x, y] points." };
        }
        return cap.capsules.drag(sessionId, x1, y1, x2, y2, button);
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
        "commands and files: exec {cmd: [...], cwd?}, write_file {path, content}, read_file {path} (a text file comes back as text); " +
        "click_element {selector: {role?, name?, text?}} (find, waiting up to 5 s, then click), say {text}, pause {ms}; " +
        "skills: use {procedure, skill?, args?} (a procedure of a skill; the call's skill is the default), check {element | window | exec | file | pixel, timeoutMs?}, pixel {x, y}, menus {window?}. " +
        "A step's frame: '<name>' gives its coordinates in one of the call's frames; save: {variable: resultField} keeps a result as {{variable}} for later steps. " +
        "expect on a step is a wait that must succeed after it; optional: true lets a step fail. observe returns a look at the end: 'screenshot', 'ui_tree' or 'browser_snapshot'.",
      parameters: z.object({
        sessionId: z.string(),
        steps: z.array(z.object({ do: z.string() }).passthrough()).min(1).max(200),
        observe: z.enum(["none", "screenshot", "ui_tree", "browser_snapshot"]).optional(),
        skill: z.string().optional().describe("The skill use steps call when they name none"),
        frames: z
          .record(z.object({ origin: z.tuple([z.number(), z.number()]), scale: z.number(), clamp: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]).optional() }))
          .optional()
          .describe("Coordinate frames steps may name: screen = origin + scale * (x, y)"),
      }),
      execute: async ({ sessionId, steps, observe, skill, frames }) => cap.capsules.runActions(sessionId, steps, { observe, skill, frames }),
    },
    {
      name: "capsulate_menus",
      description:
        "List every menu of the focused window (or the window whose title contains window) with its items, read by opening each menu and closing it again: the quick way to learn what an application can do.",
      parameters: z.object({ sessionId: z.string(), window: z.string().optional() }),
      execute: async ({ sessionId, window }) => cap.capsules.menus(sessionId, window),
    },
    // ---- skills (Phase SK): what was learned before, and what the model learned ----
    {
      name: "capsulate_skills",
      description:
        "The team's skills. action 'list' (query?) lists them; 'get' (skill, version?) reads one: its SKILL.md instructions and capsulate/skill.json (environment, frames, inputs, procedures as run_actions steps, checks, traps), so you do not discover the application again. " +
        "'save' keeps what you learned: skillMd (a whole SKILL.md) or name + description (what it does and when to use it) + instructions, plus spec and files; it creates the skill or adds a proposed version. " +
        "'versions' (skill); 'approve' (skill, version, force?) makes one current; 'reject', 'rollback' (skill, version). " +
        "'environment' (skill, sessionId, setup?) saves the capsule as the skill's environment once the software is set up: a saved template, and a version that launches from it (capsulate_launch_capsule with skill). " +
        "'rehearse' (skill, version, sessionId?, keep?) proves a version in a fresh capsule (its fingerprint and checks; follow the run with capsulate_skill_run get); 'weekly' (skill, on) rehearses the current version every week.",
      parameters: z.object({
        action: z.enum(["list", "get", "save", "versions", "approve", "reject", "rollback", "environment", "rehearse", "weekly"]),
        skill: z.string().optional(),
        query: z.string().optional(),
        version: z.number().int().positive().optional(),
        skillMd: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        instructions: z.string().optional(),
        spec: z.record(z.any()).optional(),
        files: z.array(z.object({ path: z.string(), content: z.string().optional(), contentB64: z.string().optional() })).optional(),
        note: z.string().optional(),
        state: z.enum(["draft", "proposed", "current"]).optional(),
        force: z.boolean().optional(),
        sessionId: z.string().optional().describe("For environment: the capsule to save"),
        setup: z.string().optional().describe("For environment: the procedure a launch runs once the capsule is ACTIVE"),
        keep: z.boolean().optional(),
        on: z.boolean().optional(),
      }),
      execute: async (a) => {
        const name = a.skill ?? "";
        if (a.action !== "list" && a.action !== "save" && !name) return { ok: false, error: "bad_request", message: `${a.action} needs skill (its name)` };
        if ((a.action === "approve" || a.action === "reject" || a.action === "rollback") && !a.version) {
          return { ok: false, error: "bad_request", message: `${a.action} needs version` };
        }
        switch (a.action) {
          case "list":
            return cap.skills.list({ q: a.query });
          case "get":
            return cap.skills.get(name, { version: a.version });
          case "save":
            return cap.skills.save({
              skillMd: a.skillMd, name: a.name, description: a.description, instructions: a.instructions,
              spec: a.spec as never, files: a.files, note: a.note, state: a.state, force: a.force,
            });
          case "versions":
            return cap.skills.versions(name);
          case "approve":
            return cap.skills.approve(name, a.version!, { force: a.force, note: a.note });
          case "reject":
            return cap.skills.reject(name, a.version!);
          case "rollback":
            return cap.skills.rollback(name, a.version!);
          case "environment":
            if (!a.sessionId) return { ok: false, error: "bad_request", message: "environment needs sessionId" };
            return cap.skills.environment(name, { sessionId: a.sessionId, setup: a.setup, note: a.note, state: a.state, force: a.force });
          case "rehearse":
            if (!a.version) return { ok: false, error: "bad_request", message: "rehearse needs version" };
            return cap.skills.rehearse(name, a.version, { sessionId: a.sessionId, keep: a.keep });
          case "weekly":
            if (a.on === undefined) return { ok: false, error: "bad_request", message: "weekly needs on" };
            return cap.skills.setWeekly(name, a.on);
        }
      },
    },
    {
      name: "capsulate_lesson",
      description:
        "A lesson records how a job is done on a capsule so it can become a skill: while it records, every action taken there through the API is logged in full, and a person's clicks, keys and typing on the shared screen are recorded with the elements they hit (typing in a password field is masked). action 'start' (sessionId, title, goal?, mode 'ai' or 'human'), 'note' (lessonId, text, screenshot?), 'pause', 'resume', 'finish', 'discard' (lessonId), 'get' (lessonId: the digest once finished, the steps in plain words each with the step that does it again), 'draft' (lessonId, skill?, description?), 'on' (sessionId: the lesson recording on a capsule), 'list'.",
      parameters: z.object({
        action: z.enum(["start", "note", "pause", "resume", "finish", "discard", "get", "draft", "on", "list"]),
        lessonId: z.string().optional(),
        sessionId: z.string().optional(),
        title: z.string().optional(),
        goal: z.string().optional(),
        mode: z.enum(["ai", "human"]).optional(),
        video: z.boolean().optional(),
        voice: z.boolean().optional(),
        skill: z.string().optional(),
        text: z.string().optional(),
        screenshot: z.boolean().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
      }),
      execute: async (a) => {
        const id = a.lessonId ?? "";
        if (!["start", "list", "on"].includes(a.action) && !id) return { ok: false, error: "bad_request", message: `${a.action} needs lessonId` };
        switch (a.action) {
          case "start":
            if (!a.sessionId || !a.title) return { ok: false, error: "bad_request", message: "start needs sessionId and title" };
            return cap.lessons.start({ sessionId: a.sessionId, title: a.title, goal: a.goal, mode: a.mode ?? "ai", skillId: a.skill, video: a.video, voice: a.voice });
          case "note":
            if (!a.text) return { ok: false, error: "bad_request", message: "note needs text" };
            return cap.lessons.note(id, a.text, { screenshot: a.screenshot });
          case "pause":
            return cap.lessons.pause(id);
          case "resume":
            return cap.lessons.resume(id);
          case "finish":
            return cap.lessons.finish(id);
          case "discard":
            await cap.lessons.discard(id);
            return { ok: true };
          case "get": {
            const l = await cap.lessons.get(id);
            return l.status === "recording" || l.status === "paused" ? l : cap.lessons.digest(id);
          }
          case "draft":
            return cap.lessons.draft(id, { skill: a.skill, description: a.description });
          case "on":
            if (!a.sessionId) return { ok: false, error: "bad_request", message: "on needs sessionId" };
            return (await cap.lessons.onCapsule(a.sessionId)) ?? { lesson: null };
          case "list":
            return cap.lessons.list({ status: a.status });
        }
      },
    },
    {
      name: "capsulate_inbox",
      description:
        "The team's inbox: runs that ask a question or are stuck on a step, versions waiting for approval, versions whose rehearsal failed, and skills whose software changed.",
      parameters: z.object({}),
      execute: async () => cap.inbox.list(),
    },
    // ---- runs (Phase SK): a skill's procedure in the background ----
    {
      name: "capsulate_skill_run",
      description:
        "Run a skill's procedure (or steps that call its procedures) in the background, with no time limit. action 'start' (sessionId, skill, procedure? default main, inputs?, steps?; or launch: true to start the skill's environment) starts it and waits up to waitMs (default 20000) for it to end or to need you; 'get' (runId, waitMs?); 'continue' (runId with values answering its question, or continueAction 'retry' or 'skip', or steps to run instead of a stuck step, kept as a proposed fix); 'cancel' (runId); 'list' (skill?, status?). " +
        "A run that needs you has status needs_input (waiting.question, waiting.gives) or needs_help (waiting.step, waiting.error).",
      parameters: z.object({
        action: z.enum(["start", "get", "continue", "cancel", "list"]),
        runId: z.string().optional(),
        sessionId: z.string().optional(),
        skill: z.string().optional(),
        procedure: z.string().optional(),
        inputs: z.record(z.any()).optional(),
        steps: z.array(z.object({ do: z.string() }).passthrough()).optional(),
        launch: z.boolean().optional(),
        keep: z.boolean().optional(),
        values: z.record(z.any()).optional(),
        continueAction: z.enum(["retry", "skip"]).optional(),
        note: z.string().optional(),
        status: z.string().optional(),
        waitMs: z.number().int().min(0).max(25000).optional(),
      }),
      execute: async (a) => {
        const settle = async (runId: string, waitMs: number) => {
          const deadline = Date.now() + waitMs;
          let r = await cap.runs.get(runId, { waitMs: Math.min(waitMs, 25000) });
          while (!["succeeded", "failed", "cancelled", "needs_input", "needs_help"].includes(r.status) && Date.now() < deadline) {
            r = await cap.runs.get(runId, { waitMs: Math.min(deadline - Date.now(), 25000) });
          }
          return r;
        };
        if (a.action !== "start" && a.action !== "list" && !a.runId) return { ok: false, error: "bad_request", message: `${a.action} needs runId` };
        switch (a.action) {
          case "start": {
            const run = await cap.runs.start({ sessionId: a.sessionId, skill: a.skill, procedure: a.procedure, inputs: a.inputs, steps: a.steps as never, launch: a.launch, keep: a.keep });
            return settle(run.runId, a.waitMs ?? 20000);
          }
          case "get":
            return a.waitMs ? settle(a.runId!, a.waitMs) : cap.runs.get(a.runId!);
          case "continue":
            await cap.runs.continue(a.runId!, { values: a.values, steps: a.steps as never, action: a.continueAction, note: a.note });
            return settle(a.runId!, a.waitMs ?? 20000);
          case "cancel":
            return cap.runs.cancel(a.runId!);
          case "list":
            return cap.runs.list({ skill: a.skill, status: a.status });
        }
      },
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
