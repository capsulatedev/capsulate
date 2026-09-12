// @capsulate/ai-tools — drop-in sandbox tools for AI agent frameworks.
//
// One set of tool specs (name + description + zod parameters + execute), built on
// @capsulate/sdk, adapted to each framework's tool shape:
//   • Vercel AI SDK   → `capsulateTools(cap)`        (use directly as `tools`)
//   • LangChain (JS)  → `capsulateLangChainSpecs(cap)` (wrap each in DynamicStructuredTool)
//   • LlamaIndex/CrewAI/others → `capsulateToolSpecs(cap)` (generic spec; adapt trivially)
//
// Zero framework dependencies — it only needs @capsulate/sdk + zod, so it builds
// anywhere; you bring your own framework. See the README for per-framework one-liners.

import { z, type ZodTypeAny } from "zod";
import { Capsulate, type CapsulateOptions } from "@capsulate/sdk";

export interface ToolSpec<P extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  parameters: P;
  execute: (args: z.infer<P>) => Promise<unknown>;
}

/** Build the Capsulate agent tool specs bound to a client (or client options). */
export function capsulateToolSpecs(clientOrOpts: Capsulate | CapsulateOptions): ToolSpec[] {
  const cap = clientOrOpts instanceof Capsulate ? clientOrOpts : new Capsulate(clientOrOpts);

  const specs: ToolSpec[] = [
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
      description: "Run a shell command (as an argv array) inside a capsule. Returns stdout, stderr, exit code.",
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
        "Take a screenshot of a desktop capsule's screen. Returns a base64 PNG plus its width/height. Use to see the screen before acting.",
      parameters: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => {
        const s = await cap.capsules.screenshot(sessionId);
        return { imageB64: s.imageB64, width: s.width, height: s.height, format: s.format };
      },
    },
    {
      name: "capsulate_ui_tree",
      description:
        "Get the desktop's accessibility tree (real UI elements with role, name, value, on-screen bounds and states) — far more reliable than guessing pixel coordinates. Set interesting=true for just the actionable/labelled elements.",
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
      description: "Press a key or chord on a desktop capsule, e.g. ['ctrl','c'] or ['Return'].",
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
        "Roll back to a checkpoint: launches a fresh capsule cloned from the snapshot and (by default) destroys the current one. Returns the NEW sessionId — use it from now on.",
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
        "Get the structured action trace for this run (every interaction in order). Use to verify/summarize what was done — pairs with the recording for a provable report.",
      parameters: z.object({ sessionId: z.string() }),
      execute: async ({ sessionId }) => {
        const t = await cap.capsules.trace(sessionId);
        return { count: t.count, events: t.events };
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
  ];
  return specs;
}

/**
 * Vercel AI SDK adapter. The returned record plugs straight into `generateText({ tools })` —
 * each value is `{ description, parameters, execute }`, exactly the shape the AI SDK accepts.
 *
 *   import { capsulateTools } from "@capsulate/ai-tools";
 *   const tools = capsulateTools({ apiKey: process.env.CAPSULATE_API_KEY });
 *   await generateText({ model, prompt, tools, maxSteps: 8 });
 */
export function capsulateTools(
  clientOrOpts: Capsulate | CapsulateOptions,
): Record<string, { description: string; parameters: ZodTypeAny; execute: (args: any) => Promise<unknown> }> {
  const out: Record<string, { description: string; parameters: ZodTypeAny; execute: (args: any) => Promise<unknown> }> = {};
  for (const s of capsulateToolSpecs(clientOrOpts)) {
    out[s.name] = { description: s.description, parameters: s.parameters, execute: s.execute };
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
