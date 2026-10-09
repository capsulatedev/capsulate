#!/usr/bin/env node
// Phase LCU — end-to-end smoke test of the MCP live tools, with no stack: a fake Capsulate API on
// localhost plus a real MCP client that spawns the built server (dist/index.js) over stdio.
//
//   npm run build --workspace @capsulate/sdk && npm run build --workspace @capsulate/mcp
//   node apps/mcp/scripts/smoke-live.mjs
//
// Exits 0 when every check passes.

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SID = "sess-ubuntu-22.04-desktop-smoke";

// ---- fake API ----
let control = { sessionId: SID, state: "free", since: new Date().toISOString(), version: 0 };
const waiters = new Set();
const said = [];
function setControl(patch) {
  control = { ...control, ...patch, since: new Date().toISOString(), version: control.version + 1 };
  for (const w of waiters) w();
  waiters.clear();
}

const api = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  const send = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const p = u.pathname.replace(/^\/api\/v1/, "");
  const base = `/sessions/${SID}`;
  if (p === `${base}/control` && req.method === "GET") return send(200, control);
  if (p === `${base}/control/wait`) {
    const v = Number(u.searchParams.get("version") ?? control.version);
    const t = Number(u.searchParams.get("timeout") ?? 25);
    if (control.version !== v) return send(200, { changed: true, control });
    const done = () => send(200, { changed: control.version !== v, control });
    const timer = setTimeout(() => {
      waiters.delete(done);
      done();
    }, t * 1000);
    waiters.add(() => {
      clearTimeout(timer);
      done();
    });
    return;
  }
  if (p === `${base}/control/handoff`) {
    setControl({ state: "human", by: "agent", handoff: true, note: json.note });
    // The "person" hands back after a moment, with a note.
    setTimeout(() => setControl({ state: "free", by: "link", handoff: false, note: "Signed in, all yours" }), 800);
    return send(200, control);
  }
  if (p === `${base}/control/take`) {
    if (control.state === "human") return send(409, { error: "human_in_control", control });
    setControl({ state: "agent", by: "agent", handoff: false, note: json.note || "" });
    return send(200, control);
  }
  if (p === `${base}/control/release`) {
    setControl({ state: "free", by: "agent", handoff: false, note: json.note || "" });
    return send(200, control);
  }
  if (p === `${base}/say`) {
    said.push(json.text);
    return send(200, { ok: true });
  }
  if (p === `${base}/console-link`) {
    return send(200, { url: `https://app.example.test/live/${SID}?t=tok`, token: "tok", mode: json.mode || "control", expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  }
  if (p === `${base}/click`) {
    if (control.state === "human") return send(409, { error: "human_in_control", message: "A person is using this screen.", control });
    return send(200, { ok: true });
  }
  send(404, { error: `fake api: no route ${req.method} ${p}` });
});

await new Promise((r) => api.listen(0, "127.0.0.1", r));
const port = api.address().port;

// ---- MCP client ----
const keyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lcu-smoke-")), "key.env");
// A fake key for the fake API above (never a real credential). gitleaks:allow
fs.writeFileSync(keyFile, ["# smoke key", "CAPSULATE_API_KEY=cap_live_smoke", ""].join("\n")); // gitleaks:allow
function envWithout(name) {
  const e = { ...process.env };
  delete e[name];
  return e;
}
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "..", "dist", "index.js")],
  // The key comes from a dotenv-style file (CAPSULATE_API_KEY_FILE), the way a repo config keeps it out of git.
  env: { ...envWithout("CAPSULATE_API_KEY"), CAPSULATE_API_KEY_FILE: keyFile, CAPSULATE_BASE_URL: `http://127.0.0.1:${port}`, CAPSULATE_TEAM_ID: "team-smoke" },
  stderr: "pipe",
});
const client = new Client({ name: "lcu-smoke", version: "1.0.0" });
await client.connect(transport);

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const text = (r) => (r.content || []).map((c) => c.text || "").join("\n");
const call = (name, args) => client.callTool({ name, arguments: args });

const { tools } = await client.listTools();
const names = new Set(tools.map((t) => t.name));
for (const n of [
  "capsulate_console_link",
  "capsulate_control",
  "capsulate_handoff",
  "capsulate_wait_for_handback",
  "capsulate_say",
  "capsulate_ui_tree",
  "capsulate_click_element",
  "capsulate_move",
  "capsulate_scroll",
  "capsulate_drag",
  "capsulate_clipboard",
  "capsulate_windows",
  "capsulate_ocr",
]) {
  check(names.has(n), `tool ${n} is listed`);
}
check(/capsulate_handoff/.test(client.getInstructions() || ""), "server instructions explain the handoff");

const link = JSON.parse(text(await call("capsulate_console_link", { sessionId: SID, mode: "view", ttlMinutes: 30 })));
check(link.url.includes(`/live/${SID}?t=`) && link.mode === "view", "console link returns a live URL");

await call("capsulate_say", { sessionId: SID, text: "Opening the browser" });
check(said[0] === "Opening the browser", "say reaches the API");

const took = JSON.parse(text(await call("capsulate_control", { sessionId: SID, action: "take" })));
check(took.state === "agent", "control take puts the AI in the driving seat");

const t0 = Date.now();
const handed = JSON.parse(text(await call("capsulate_handoff", { sessionId: SID, note: "Please sign in to GitHub", waitSeconds: 20 })));
check(handed.handedBack === true && handed.note === "Signed in, all yours", "handoff waits for the person and returns their note");
check(Date.now() - t0 < 10_000, "handoff returns promptly after the hand back");

setControl({ state: "human", by: "owner", handoff: false, note: "" });
const refused = await call("capsulate_click", { sessionId: SID, x: 1, y: 2 });
check(refused.isError === true && /capsulate_wait_for_handback/.test(text(refused)), "an input while a person drives explains how to wait");

setTimeout(() => setControl({ state: "free", by: "owner", note: "done" }), 500);
const waited = JSON.parse(text(await call("capsulate_wait_for_handback", { sessionId: SID, waitSeconds: 10 })));
check(waited.handedBack === true && waited.note === "done", "wait_for_handback returns when the person hands back");

const released = JSON.parse(text(await call("capsulate_control", { sessionId: SID, action: "release" })));
check(released.state === "free", "control release frees the screen");

await client.close();
api.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall live MCP checks passed");
process.exit(failures ? 1 : 0);
