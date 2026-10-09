#!/usr/bin/env node
// @capsulate/mcp — the Capsulate Model Context Protocol server.
//
// Exposes capsule tools (launch / exec / run / files / computer-use / snapshot /
// destroy) over stdio so any MCP client — Claude Desktop, Cursor, Windsurf,
// Antigravity, etc. — can drive isolated cloud sandboxes. Credentials come from
// the environment:
//
//   CAPSULATE_API_KEY       (required)   a cap_live_ key from the dashboard
//   CAPSULATE_API_KEY_FILE  (optional)   instead of the key itself: a file holding the key, either the
//                                        bare key or a CAPSULATE_API_KEY=... line (keeps the key out of
//                                        MCP config files)
//   CAPSULATE_BASE_URL      (optional)   defaults to https://api.capsulate.dev
//   CAPSULATE_TEAM_ID       (optional)   defaults to the key's team

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Capsulate, CapsulateError } from "@capsulate/sdk";
import { registerLiveTools, LIVE_INSTRUCTIONS } from "./tools-live.js";

/// keyFromFile reads CAPSULATE_API_KEY_FILE: a bare key, or a dotenv-style CAPSULATE_API_KEY=... line.
function keyFromFile(file: string | undefined): string | undefined {
  if (!file) return undefined;
  try {
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*CAPSULATE_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
    const bare = raw.trim();
    return bare && !/\s/.test(bare) && !bare.includes("=") ? bare : undefined;
  } catch {
    process.stderr.write(`[capsulate-mcp] could not read CAPSULATE_API_KEY_FILE (${file}).\n`);
    return undefined;
  }
}

const apiKey = process.env.CAPSULATE_API_KEY || keyFromFile(process.env.CAPSULATE_API_KEY_FILE);
if (!apiKey) {
  process.stderr.write(
    "[capsulate-mcp] CAPSULATE_API_KEY is not set. Create a key in the dashboard (Settings → API & Keys) and set it in your MCP client config.\n",
  );
  process.exit(1);
}

const cap = new Capsulate({
  apiKey,
  baseUrl: process.env.CAPSULATE_BASE_URL,
  teamId: process.env.CAPSULATE_TEAM_ID,
  userAgent: "capsulate-mcp/0.3.0",
});

const server = new McpServer({ name: "capsulate", version: "0.3.0" }, { instructions: LIVE_INSTRUCTIONS });

type TextResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): TextResult {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function err(e: unknown): TextResult {
  // Phase LCU: a person holds the shared screen. Say what to do instead of a bare 409.
  if (e instanceof CapsulateError && e.isHumanInControl) {
    return {
      content: [
        {
          type: "text",
          text: "A person holds this capsule's screen right now (they took over, or you handed it to them). Your input was not sent. Call capsulate_wait_for_handback, then retry.",
        },
      ],
      isError: true,
    };
  }
  const msg =
    e instanceof CapsulateError
      ? `Capsulate error (${e.status}): ${e.message}`
      : e instanceof Error
        ? e.message
        : String(e);
  return { content: [{ type: "text", text: msg }], isError: true };
}

// withShot returns the action's confirmation line plus, when the verb was asked to
// capture a post-action screenshot, the resulting frame as image content — so the model
// gets act→observe in one tool call instead of a separate capsulate_screenshot round-trip.
function withShot(r: { screenshot?: { imageB64?: string } }, msg: string) {
  const img = r.screenshot?.imageB64;
  if (!img) return ok(msg);
  return {
    content: [
      { type: "text" as const, text: msg },
      { type: "image" as const, data: img, mimeType: "image/png" },
    ],
  };
}

// Shared schema fragment: opt-in post-action screenshot for the input verbs.
const shotSchema = {
  screenshot: z.boolean().optional().describe("Capture a screenshot after the action and return it"),
  screenshotDelayMs: z
    .number()
    .optional()
    .describe("Settle delay (ms) before that screenshot so it reflects the result (max 10000)"),
};

// ---- capsule lifecycle ----

server.registerTool(
  "capsulate_launch",
  {
    title: "Launch a capsule",
    description:
      "Launch a new isolated cloud sandbox (capsule) and (by default) wait until it is ready. Returns the capsule id and connection info. Use the returned sessionId for exec/files/etc.",
    inputSchema: {
      template: z.string().describe("Template / OS / bundle id, e.g. 'ubuntu-22.04-headless'"),
      size: z.string().optional().describe("Resource size, e.g. '2c4g' (default)"),
      region: z.string().optional().describe("Region hint; omit for automatic placement"),
      bundle: z.string().optional().describe("Software bundle (Bucket B) id to launch from"),
      snapshot: z.string().optional().describe("Snapshot/template id to restore from"),
      env: z.record(z.string()).optional().describe("Environment variables to inject"),
      wait: z.boolean().optional().describe("Wait until ACTIVE (default true)"),
    },
  },
  async (args) => {
    try {
      const opts = {
        template: args.template,
        size: args.size ?? "2c4g",
        region: args.region,
        bundle: args.bundle,
        snapshot: args.snapshot,
        env: args.env,
      };
      const c = args.wait === false ? await cap.capsules.create(opts) : await cap.capsules.launch(opts);
      return ok({ sessionId: c.id, status: c.status, template: c.data.templateId, size: c.data.size, region: c.data.region });
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_list",
  { title: "List capsules", description: "List the team's active capsules.", inputSchema: {} },
  async () => {
    try {
      const list = await cap.capsules.list();
      return ok(list.map((c: any) => ({ sessionId: c.sessionId, status: c.status, template: c.templateId, size: c.size })));
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_get",
  {
    title: "Get a capsule",
    description: "Fetch a capsule's full details by id.",
    inputSchema: { sessionId: z.string() },
  },
  async (args) => {
    try {
      const c = await cap.capsules.get(args.sessionId);
      return ok(c.data);
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_destroy",
  {
    title: "Destroy a capsule",
    description: "Terminate a capsule and release its resources.",
    inputSchema: { sessionId: z.string() },
  },
  async (args) => {
    try {
      await cap.capsules.destroy(args.sessionId);
      return ok(`Destroyed ${args.sessionId}`);
    } catch (e) {
      return err(e);
    }
  },
);

// ---- interaction ----

server.registerTool(
  "capsulate_exec",
  {
    title: "Run a command",
    description:
      "Execute a command inside a capsule and return stdout, stderr, and the exit code. Provide the command as an argv array, e.g. ['ls','-la','/workspace'].",
    inputSchema: {
      sessionId: z.string(),
      command: z.array(z.string()).describe("Command as an argv array"),
      cwd: z.string().optional(),
      timeoutSec: z.number().optional(),
    },
  },
  async (args) => {
    try {
      const r = await cap.capsules.exec(args.sessionId, args.command, {
        cwd: args.cwd,
        timeoutSec: args.timeoutSec,
      });
      return ok({ stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode });
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_run_code",
  {
    title: "Run code",
    description: "Run a snippet of code inside a capsule (python, node, or bash). Returns stdout/stderr/exit.",
    inputSchema: {
      sessionId: z.string(),
      code: z.string(),
      lang: z.enum(["python", "node", "bash"]).optional(),
      timeoutSec: z.number().optional(),
    },
  },
  async (args) => {
    try {
      const r = await cap.capsules.run(args.sessionId, args.code, {
        lang: args.lang ?? "bash",
        timeoutSec: args.timeoutSec,
      });
      return ok({ stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode });
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_write_file",
  {
    title: "Write a file",
    description: "Write a UTF-8 text file inside a capsule.",
    inputSchema: { sessionId: z.string(), path: z.string(), content: z.string() },
  },
  async (args) => {
    try {
      const r = await cap.capsules.writeFile(args.sessionId, args.path, args.content);
      return ok({ path: args.path, bytesWritten: r.bytesWritten });
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_read_file",
  {
    title: "Read a file",
    description: "Read a UTF-8 text file from inside a capsule.",
    inputSchema: { sessionId: z.string(), path: z.string() },
  },
  async (args) => {
    try {
      const text = await cap.capsules.readFileText(args.sessionId, args.path);
      return ok(text);
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_set_env",
  {
    title: "Set environment variables",
    description: "Set environment variables inside a running capsule.",
    inputSchema: { sessionId: z.string(), vars: z.record(z.string()), secret: z.boolean().optional() },
  },
  async (args) => {
    try {
      await cap.capsules.setEnv(args.sessionId, args.vars, args.secret);
      return ok(`Set ${Object.keys(args.vars).length} variable(s)`);
    } catch (e) {
      return err(e);
    }
  },
);

// ---- computer-use (desktop capsules) ----

server.registerTool(
  "capsulate_screenshot",
  {
    title: "Take a screenshot",
    description: "Capture a screenshot of a desktop capsule. Returns the image so you can see the screen.",
    inputSchema: { sessionId: z.string() },
  },
  async (args) => {
    try {
      const s = await cap.capsules.screenshot(args.sessionId);
      return {
        content: [
          { type: "image" as const, data: s.imageB64 ?? "", mimeType: "image/png" },
        ],
      };
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_click",
  {
    title: "Click",
    description:
      "Click at pixel (x, y) in a desktop capsule. Pass screenshot:true to see the screen after the click.",
    inputSchema: {
      sessionId: z.string(),
      x: z.number(),
      y: z.number(),
      button: z.enum(["left", "right", "middle"]).optional(),
      count: z.number().optional(),
      ...shotSchema,
    },
  },
  async (args) => {
    try {
      const r = await cap.capsules.click(args.sessionId, args.x, args.y, {
        button: args.button,
        count: args.count,
        screenshot: args.screenshot,
        screenshotDelayMs: args.screenshotDelayMs,
      });
      return withShot(r, `clicked at (${args.x}, ${args.y})`);
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_type",
  {
    title: "Type text",
    description: "Type text into the focused field of a desktop capsule.",
    inputSchema: { sessionId: z.string(), text: z.string(), ...shotSchema },
  },
  async (args) => {
    try {
      const r = await cap.capsules.type(args.sessionId, args.text, {
        screenshot: args.screenshot,
        screenshotDelayMs: args.screenshotDelayMs,
      });
      return withShot(r, `typed ${args.text.length} characters`);
    } catch (e) {
      return err(e);
    }
  },
);

server.registerTool(
  "capsulate_key",
  {
    title: "Press keys",
    description:
      "Press keys in a desktop capsule, in order. Each entry is one key or a '+'-joined chord (xdotool names): ['ctrl+c'] copies, ['ctrl+l', 'Return'] focuses then submits, ['alt+F4'] closes a window. A bare modifier followed by a key is joined into a chord, so ['ctrl','v'] also pastes.",
    inputSchema: {
      sessionId: z.string(),
      keys: z.array(z.string()).describe("Keys or chords, e.g. ['ctrl+s'] or ['Escape']"),
      ...shotSchema,
    },
  },
  async (args) => {
    try {
      const r = await cap.capsules.key(args.sessionId, args.keys, {
        screenshot: args.screenshot,
        screenshotDelayMs: args.screenshotDelayMs,
      });
      return withShot(r, `pressed ${args.keys.join(", then ")}`);
    } catch (e) {
      return err(e);
    }
  },
);

// ---- snapshots ----

server.registerTool(
  "capsulate_snapshot",
  {
    title: "Snapshot a capsule",
    description: "Capture a snapshot of a capsule's current state (restorable later).",
    inputSchema: { sessionId: z.string(), name: z.string().optional() },
  },
  async (args) => {
    try {
      const s = await cap.capsules.snapshots.create(args.sessionId, args.name);
      return ok({ snapshotId: s.id, sizeBytes: s.sizeBytes });
    } catch (e) {
      return err(e);
    }
  },
);

// ---- catalog (so the model can discover what to launch) ----

server.registerTool(
  "capsulate_catalog",
  {
    title: "List templates & bundles",
    description: "List the operating systems / base templates and marketplace bundles you can launch.",
    inputSchema: {},
  },
  async () => {
    try {
      const [catalog, bundles] = await Promise.all([
        cap.catalog.list().catch(() => []),
        cap.bundles.list().catch(() => []),
      ]);
      return ok({
        operatingSystems: (catalog as any[]).map((a) => a.id),
        bundles: (bundles as any[]).map((b) => ({ id: b.id, name: b.displayName, availability: b.availability })),
      });
    } catch (e) {
      return err(e);
    }
  },
);

// ---- live computer use (Phase LCU): deep verbs, console links, control, handoff, narration ----
registerLiveTools({ server, cap, ok, err, withShot });

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[capsulate-mcp] ready (stdio)\n");
}

main().catch((e) => {
  process.stderr.write(`[capsulate-mcp] fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
