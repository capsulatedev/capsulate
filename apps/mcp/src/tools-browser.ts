// LCU M2 — the browser fast path as MCP tools: the agent's own Chrome inside a desktop capsule, driven over the
// Chrome DevTools Protocol at page speed while a person watches the same screen. Read the page as an outline with
// refs (capsulate_browser_snapshot), then act by ref.

import { z } from "zod";
import type { BrowserSnapshot, BrowserTarget } from "@capsulate/sdk";
import type { ToolKit } from "./tools-live.js";

const targetSchema = {
  ref: z.string().optional().describe("A ref from capsulate_browser_snapshot, e.g. 'e12' (most exact)"),
  selector: z.string().optional().describe("A CSS selector"),
  text: z.string().optional().describe("Visible text or accessible name of the element"),
};

function targetOf(a: { ref?: string; selector?: string; text?: string }): BrowserTarget {
  const t: BrowserTarget = {};
  if (a.ref) t.ref = a.ref;
  if (a.selector) t.selector = a.selector;
  if (a.text) t.text = a.text;
  return t;
}

function quote(s: string) {
  return JSON.stringify(s ?? "");
}

/** The snapshot as compact lines: cheaper and easier to read than JSON. */
export function outline(s: BrowserSnapshot): string {
  const lines = [`${s.title || "(untitled)"} | ${s.url}`];
  for (const it of s.items) {
    let l = `[${it.ref}] ${it.role}${it.level ? ` h${it.level}` : ""} ${quote(it.name)}`;
    if (it.value !== undefined && it.value !== "") l += ` value=${quote(it.value)}`;
    if (it.checked !== undefined) l += it.checked ? " checked" : " unchecked";
    if (it.disabled) l += " disabled";
    if (it.inView === false) l += " (scrolled away)";
    lines.push(l);
  }
  if (s.truncated) lines.push("... more elements: raise max, or pass interactive true");
  return lines.join("\n");
}

function page(r: { url?: string; title?: string }) {
  return r.url ? ` Now at ${r.url}${r.title ? ` (${r.title})` : ""}.` : "";
}

export function registerBrowserTools(t: ToolKit) {
  const { server, cap, ok, err } = t;
  const browser = (sessionId: string) => cap.capsules.browser(sessionId);

  server.registerTool(
    "capsulate_browser_open",
    {
      title: "Open the browser",
      description:
        "Open the agent's own Chrome on a desktop capsule (the person watching sees it) and optionally load a url. For web pages prefer the capsulate_browser_* tools: they read the page as text with refs and act at page speed, faster and more exact than screenshots and clicks.",
      inputSchema: { sessionId: z.string(), url: z.string().optional() },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).open(a.url);
        return ok(`Browser ${r.started ? "started" : "ready"}.${page(r)} Next: capsulate_browser_snapshot.`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_navigate",
    {
      title: "Go to a url",
      description: "Load a url in the browser's current tab and wait for it.",
      inputSchema: { sessionId: z.string(), url: z.string(), tab: z.string().optional() },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).navigate(a.url, { tab: a.tab });
        return ok(`Loaded.${page(r)}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_snapshot",
    {
      title: "Read the page",
      description:
        "Read the current page as an outline of elements with refs, e.g. [e12] link \"Pricing\". Act on them by ref with the other browser tools. Refs stay valid until the element goes away; take a new snapshot after the page changes.",
      inputSchema: {
        sessionId: z.string(),
        interactive: z.boolean().optional().describe("Only elements you can click or type into (shorter)"),
        max: z.number().optional().describe("Most elements to list (default 400)"),
        tab: z.string().optional(),
      },
    },
    async (a) => {
      try {
        return ok(outline(await browser(a.sessionId).snapshot({ interactive: a.interactive, max: a.max, tab: a.tab })));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_click",
    {
      title: "Click in the page",
      description: "Click an element of the page by ref (from capsulate_browser_snapshot), CSS selector or visible text.",
      inputSchema: {
        sessionId: z.string(),
        ...targetSchema,
        clicks: z.number().optional().describe("2 for a double click"),
        button: z.enum(["left", "right", "middle"]).optional(),
      },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).click(targetOf(a), { clicks: a.clicks, button: a.button });
        return ok(`Clicked ${r.clicked.role} ${quote(r.clicked.name)} [${r.clicked.ref}].${page(r)}`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_fill",
    {
      title: "Type into a field",
      description:
        "Type a value into a field (replacing what is there); submit presses Enter after. Never use it for passwords or card numbers: hand the screen to the person instead (capsulate_handoff).",
      inputSchema: { sessionId: z.string(), ...targetSchema, value: z.string(), submit: z.boolean().optional() },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).fill(targetOf(a), a.value, { submit: a.submit });
        return ok(`Filled ${r.filled.role} ${quote(r.filled.name)} (${r.chars} characters)${r.submitted ? " and pressed Enter" : ""}.`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_select",
    {
      title: "Choose an option",
      description: "Choose an option of a dropdown (<select>) by its value or label.",
      inputSchema: { sessionId: z.string(), ...targetSchema, option: z.string() },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).select(targetOf(a), a.option);
        return ok(`Selected ${quote(r.selected)}.`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_press",
    {
      title: "Press keys in the page",
      description: "Press keys in the page, in order: 'Enter', 'Tab', 'Escape', 'ArrowDown', 'PageDown' or a single character.",
      inputSchema: { sessionId: z.string(), keys: z.array(z.string()).min(1) },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).press(...a.keys);
        return ok(`Pressed ${r.pressed.join(", ")}.`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_scroll",
    {
      title: "Scroll the page",
      description: "Scroll the page by dy pixels (negative scrolls up), or bring an element into view by ref, selector or text.",
      inputSchema: { sessionId: z.string(), dy: z.number().optional(), ...targetSchema },
    },
    async (a) => {
      try {
        return ok(await browser(a.sessionId).scroll({ dy: a.dy, ...targetOf(a) }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_wait",
    {
      title: "Wait for the page",
      description:
        "Wait until an element or text appears (or, with state 'hidden', goes away). Without a target, waits for the page to finish loading.",
      inputSchema: {
        sessionId: z.string(),
        ...targetSchema,
        state: z.enum(["visible", "hidden"]).optional(),
        timeoutMs: z.number().optional().describe("Default 10000, at most 110000"),
      },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).wait(targetOf(a), { state: a.state, timeoutMs: a.timeoutMs });
        if (r.timedOut) return ok(`Not ${a.state === "hidden" ? "gone" : "there"} after ${r.waitedMs} ms.`);
        return ok(r.element ? `Found ${r.element.role} ${quote(r.element.name)} [${r.element.ref}] after ${r.waitedMs} ms.` : `Done after ${r.waitedMs} ms.`);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_text",
    {
      title: "Read text",
      description: "The page's visible text, or one element's (by ref, selector or text).",
      inputSchema: { sessionId: z.string(), ...targetSchema, max: z.number().optional().describe("Most characters (default 20000)") },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).text(targetOf(a), { max: a.max });
        return ok(r.url ? `${r.title ?? ""} | ${r.url}\n\n${r.text}` : r.text);
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_screenshot",
    {
      title: "Screenshot the page",
      description: "A screenshot of the browser page only (fast, small JPEG). For the whole desktop use capsulate_screenshot.",
      inputSchema: { sessionId: z.string(), fullPage: z.boolean().optional() },
    },
    async (a) => {
      try {
        const r = await browser(a.sessionId).screenshot({ fullPage: a.fullPage });
        return { content: [{ type: "image" as const, data: r.base64, mimeType: r.format === "png" ? "image/png" : "image/jpeg" }] };
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_tabs",
    {
      title: "Browser tabs",
      description: "List the browser's tabs, or open (new, with url), switch to (select) or close one (by tab id).",
      inputSchema: {
        sessionId: z.string(),
        action: z.enum(["list", "new", "select", "close"]).optional(),
        tab: z.string().optional(),
        url: z.string().optional(),
      },
    },
    async (a) => {
      try {
        return ok(await browser(a.sessionId).tabs({ action: a.action, tab: a.tab, url: a.url }));
      } catch (e) {
        return err(e);
      }
    },
  );

  server.registerTool(
    "capsulate_browser_eval",
    {
      title: "Run JavaScript in the page",
      description: "Evaluate a JavaScript expression in the page and return its JSON value (awaits promises). For reading data the outline does not show.",
      inputSchema: { sessionId: z.string(), expression: z.string() },
    },
    async (a) => {
      try {
        return ok((await browser(a.sessionId).eval(a.expression)).value ?? null);
      } catch (e) {
        return err(e);
      }
    },
  );
}

/** Guidance for the model: when to use the browser tools. */
export const BROWSER_INSTRUCTIONS =
  "For web pages, use the browser tools: capsulate_browser_open, then capsulate_browser_snapshot to read the page as text with refs, then click, fill, select and wait by ref. They act at page speed and are exact; the person watching sees the same Chrome. Use the screen tools (screenshot, click, ui_tree) for desktop apps and anything outside the browser.";
