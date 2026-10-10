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
import { isDeepStrictEqual } from "node:util";
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

const browserCalls = [];
const runBodies = [];
const toolsetCalls = [];
const shotBodies = [];
const notepad = { id: "0x2a", title: "Untitled - Notepad", x: 0, y: 0, w: 800, h: 600 };
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
  if (p === `${base}/control/pace`) {
    setControl({ pace: json.pace === "fast" ? undefined : json.pace });
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
  // LCU M2.6 the complete toolset: element and window actions, open, wait_for, screen, screenshot options.
  const em = p.match(new RegExp(`^${base}/element/([a-z_]+)$`));
  if (em) {
    toolsetCalls.push({ path: p, body: json });
    if (control.state === "human") return send(409, { error: "human_in_control", message: "A person is using this screen.", control });
    if (json.selector?.name === "Missing") return send(422, { error: "not_found", message: "no element matches the selector", action: em[1] });
    return send(200, { backend: "uia", ok: true, method: "pattern", element: { role: "check box", name: "Bold", x: 10, y: 20, w: 16, h: 16, cx: 18, cy: 28, states: ["enabled", "checked"] } });
  }
  const wm = p.match(new RegExp(`^${base}/windows/([a-z]+)$`));
  if (wm) {
    toolsetCalls.push({ path: p, body: json });
    return send(200, wm[1] === "close" ? { ok: true } : { ok: true, window: { ...notepad, x: json.x ?? 0, y: json.y ?? 0 } });
  }
  if (p === `${base}/open`) {
    toolsetCalls.push({ path: p, body: json });
    if (json.target === "nosuchapp") return send(422, { error: "not_found", message: "no app named nosuchapp (not in the Start menu, not a program Windows can start)", kind: "app" });
    return send(200, { ok: true, kind: "app", launched: "notepad.exe", window: notepad });
  }
  if (p === `${base}/wait_for`) {
    toolsetCalls.push({ path: p, body: json });
    return send(200, { backend: "uia", met: json.condition !== "absent", waitedMs: json.condition === "absent" ? json.timeoutMs ?? 10000 : 120 });
  }
  if (p === `${base}/screen`) return send(200, { width: 1280, height: 800, cursor: { x: 5, y: 6 }, activeWindow: notepad });
  if (p === `${base}/screenshot`) {
    shotBodies.push(json);
    if (json.format === "jpeg") return send(200, { imageB64: "/9j/4AAQ", width: 200, height: 150, format: "jpeg", scale: 0.5, region: { x: 100, y: 200, w: 400, h: 300 } });
    return send(200, { imageB64: "iVBORw0KGgo", width: 1280, height: 800, format: "png" });
  }
  // LCU M2.6 in a run: open, move the window, set a text (it must not come back), wait for it, read the screen.
  if (p === `${base}/actions` && json.steps?.[0]?.do === "open") {
    runBodies.push(json);
    const editor = { role: "document", name: "Text editor", value: "dear diary", x: 0, y: 60, w: 800, h: 540, cx: 400, cy: 330, states: ["enabled", "focused"] };
    return send(200, {
      ok: true, completed: 5, total: 5, ms: 2100,
      steps: [
        { i: 0, do: "open", ok: true, ms: 900, result: { ok: true, kind: "app", launched: "notepad.exe", window: notepad } },
        { i: 1, do: "window", ok: true, ms: 120, result: { ok: true, window: { ...notepad, x: 40, y: 30 } } },
        { i: 2, do: "element", ok: true, ms: 200, result: { backend: "uia", ok: true, method: "pattern", element: editor } },
        { i: 3, do: "wait_for", ok: true, ms: 80, result: { backend: "uia", met: true, waitedMs: 75, element: editor } },
        { i: 4, do: "screen", ok: true, ms: 30, result: { width: 1280, height: 800, cursor: { x: 5, y: 6 }, activeWindow: notepad } },
      ],
    });
  }
  // LCU M2.4 run_actions: a run that clicks, fills (the value must not come back), then stops at a failed expect.
  if (p === `${base}/actions`) {
    runBodies.push(json);
    return send(200, {
      ok: false, completed: 2, total: 3, stoppedAt: 2, stopReason: "expectation_not_met", ms: 1234,
      steps: [
        { i: 0, do: "click_element", ok: true, ms: 300, result: { element: { role: "button", name: "Sign up", cx: 640, cy: 410 }, click: { ok: true } } },
        { i: 1, do: "browser_fill", ok: true, ms: 210, result: { ok: true, result: { filled: { ref: "e2", role: "textbox", name: "Email" }, chars: 13, submitted: true } } },
        { i: 2, do: "key", ok: false, ms: 3010, error: "expectation not met: no matching element appeared within 3000 ms",
          expect: { i: 2, do: "wait_element", ok: false, ms: 3000, error: "no matching element appeared within 3000 ms" } },
      ],
      observation: { i: 3, do: "screenshot", ok: true, ms: 230, result: { imageB64: "iVBORw0KGgo", format: "png" } },
    });
  }
  // LCU M2 browser fast path.
  const bm = p.match(new RegExp(`^${base}/browser/([a-z]+)$`));
  if (bm) {
    browserCalls.push({ verb: bm[1], body: json });
    if (bm[1] === "snapshot") return send(200, { ok: true, driverMs: 4, result: { url: "https://shop.example/", title: "Shop", truncated: false, items: [{ ref: "e1", role: "link", name: "Cart", inView: true }, { ref: "e2", role: "searchbox", name: "Search", value: "", inView: true }, { ref: "e3", role: "button", name: "Buy", disabled: true, inView: false }] } });
    if (bm[1] === "click" && json.text === "Missing") return send(422, { error: "browser_error", message: 'LookupError: no element named "Missing"', verb: "click" });
    if (bm[1] === "click") return send(200, { ok: true, result: { clicked: { ref: json.ref || "e1", role: "link", name: "Cart" }, url: "https://shop.example/cart", title: "Cart" } });
    if (bm[1] === "fill") return send(200, { ok: true, result: { filled: { ref: "e2", role: "searchbox", name: "Search" }, chars: String(json.value).length, submitted: !!json.submit } });
    if (bm[1] === "screenshot") return send(200, { ok: true, result: { format: "jpeg", base64: "/9j/4AAQ" } });
    return send(200, { ok: true, result: { verb: bm[1] } });
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
  "capsulate_browser_open",
  "capsulate_browser_snapshot",
  "capsulate_browser_click",
  "capsulate_browser_fill",
  "capsulate_browser_wait",
  "capsulate_browser_screenshot",
  "capsulate_run_actions",
  "capsulate_element",
  "capsulate_window",
  "capsulate_open",
  "capsulate_wait_for",
  "capsulate_screen_info",
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

const paced = JSON.parse(text(await call("capsulate_control", { sessionId: SID, action: "pace", pace: "presentation" })));
check(paced.pace === "presentation", "control pace slows the AI down for a person watching");

// ---- the browser fast path ----
check(/capsulate_browser_snapshot/.test(client.getInstructions() || ""), "server instructions point web work at the browser tools");
const snap = text(await call("capsulate_browser_snapshot", { sessionId: SID, interactive: true }));
check(snap.startsWith("Shop | https://shop.example/") && snap.includes('[e2] searchbox "Search"') && snap.includes('[e3] button "Buy" disabled (scrolled away)'), "snapshot comes back as a compact outline with refs");
const clicked = text(await call("capsulate_browser_click", { sessionId: SID, ref: "e1" }));
check(/Clicked link "Cart" \[e1\]\. Now at https:\/\/shop\.example\/cart/.test(clicked) && browserCalls.at(-1).body.ref === "e1", "click by ref reports the element and the new page");
const filled = text(await call("capsulate_browser_fill", { sessionId: SID, ref: "e2", value: "red shoes", submit: true }));
check(/Filled searchbox "Search" \(9 characters\) and pressed Enter/.test(filled) && !filled.includes("red shoes"), "fill confirms without echoing the value");
const missing = await call("capsulate_browser_click", { sessionId: SID, text: "Missing" });
check(missing.isError === true && /no element named "Missing"/.test(text(missing)), "a missing element is an error with the reason");
const shot = await call("capsulate_browser_screenshot", { sessionId: SID });
check(shot.content?.[0]?.type === "image" && shot.content[0].mimeType === "image/jpeg", "browser screenshot returns a JPEG image");

// ---- several steps in one call (LCU M2.4) ----
check(/capsulate_run_actions/.test(client.getInstructions() || ""), "server instructions point known next steps at run_actions");
const steps = [
  { do: "click_element", selector: { name: "Sign up" } },
  { do: "browser_fill", ref: "e2", value: "me@example.org", submit: true },
  { do: "key", keys: ["enter"], expect: { selector: { name: "Welcome" }, timeoutMs: 3000 } },
];
const ran = await call("capsulate_run_actions", { sessionId: SID, steps, observe: "screenshot" });
const report = text(ran);
check(JSON.stringify(runBodies.at(-1)) === JSON.stringify({ steps, observe: "screenshot" }), "run_actions sends the steps as given, with observe");
check(/^Stopped at step 3 of 3 \(expectation_not_met\) after 2 ok/.test(report), "the report says where and why the run stopped");
check(report.includes('1. click_element ok: clicked button "Sign up" at 640, 410') && report.includes('2. browser_fill ok: filled textbox "Email" (13 characters, submitted)'), "each step is one readable line");
check(report.includes("3. key FAILED: expectation not met") && !report.includes("me@example.org"), "the failed step says why, and no filled value comes back");
check(ran.content?.at(-1)?.type === "image" && ran.content.at(-1).mimeType === "image/png", "observe screenshot comes back as an image");

// ---- the complete toolset (LCU M2.6) ----
const instructions = client.getInstructions() || "";
check(/capsulate_element/.test(instructions) && /capsulate_wait_for/.test(instructions) && /capsulate_open/.test(instructions), "server instructions point at element actions, open and waits");
const lastCall = () => toolsetCalls.at(-1) ?? {};

const toggled = await call("capsulate_element", { sessionId: SID, action: "toggle", name: "Bold", window: "Notepad" });
check(
  lastCall().path === `/sessions/${SID}/element/toggle` && isDeepStrictEqual(lastCall().body, { sessionId: SID, selector: { name: "Bold" }, window: "Notepad" }),
  "element sends the action in the path and the selector in the body",
);
check(!toggled.isError && JSON.parse(text(toggled)).element.states.includes("checked"), "element returns the element afterwards");
await call("capsulate_element", { sessionId: SID, action: "set_value", role: "document", value: "hello", index: 1 });
check(isDeepStrictEqual(lastCall().body, { sessionId: SID, selector: { role: "document" }, value: "hello", index: 1 }), "set_value sends the value and the index");
const notFound = await call("capsulate_element", { sessionId: SID, action: "invoke", name: "Missing" });
check(
  notFound.isError === true && /^Not done \(not_found\): no element matches the selector\. Check the selector with capsulate_find_element/.test(text(notFound)),
  "an element that is not there says so, with what to try next",
);
setControl({ state: "human", by: "owner", handoff: false, note: "" });
const heldEl = await call("capsulate_element", { sessionId: SID, action: "invoke", name: "Save" });
check(heldEl.isError === true && /capsulate_wait_for_handback/.test(text(heldEl)), "an element action while a person drives explains how to wait");
setControl({ state: "free", by: "owner", note: "" });

const moved = JSON.parse(text(await call("capsulate_window", { sessionId: SID, action: "move", title: "Notepad", x: 40, y: 30 })));
check(
  lastCall().path === `/sessions/${SID}/windows/move` && isDeepStrictEqual(lastCall().body, { sessionId: SID, title: "Notepad", x: 40, y: 30 }) && moved.window.x === 40,
  "window move sends the title and the new corner, and returns the window",
);

const opened = JSON.parse(text(await call("capsulate_open", { sessionId: SID, target: "notepad", waitMs: 8000 })));
check(isDeepStrictEqual(lastCall().body, { sessionId: SID, target: "notepad", waitMs: 8000 }) && opened.window.title === "Untitled - Notepad", "open sends the target and returns the new window");
const noApp = await call("capsulate_open", { sessionId: SID, target: "nosuchapp" });
check(noApp.isError === true && /Not done \(not_found\): no app named nosuchapp/.test(text(noApp)) && /the name its menu shows/.test(text(noApp)), "open of an unknown app says so, with what to try next");

await call("capsulate_wait_for", { sessionId: SID, condition: "text", name: "Status", text: "Saved", timeoutMs: 5000 });
check(isDeepStrictEqual(lastCall().body, { sessionId: SID, condition: "text", selector: { name: "Status" }, text: "Saved", timeoutMs: 5000 }), "wait_for text sends the text to wait for apart from the selector");
await call("capsulate_wait_for", { sessionId: SID, condition: "present", text: "Saved" });
check(isDeepStrictEqual(lastCall().body, { sessionId: SID, condition: "present", selector: { text: "Saved" } }), "wait_for present matches text in the selector");
const gone = JSON.parse(text(await call("capsulate_wait_for", { sessionId: SID, condition: "absent", role: "dialog", timeoutMs: 3000 })));
check(gone.met === false && gone.waitedMs === 3000, "a wait that ends unmet is a result (met false), not an error");
await call("capsulate_wait_for", { sessionId: SID, condition: "screen_stable", stableMs: 800 });
check(isDeepStrictEqual(lastCall().body, { sessionId: SID, condition: "screen_stable", stableMs: 800 }), "wait_for screen_stable sends no selector");

const screen = JSON.parse(text(await call("capsulate_screen_info", { sessionId: SID })));
check(screen.width === 1280 && screen.cursor.x === 5 && screen.activeWindow.title === "Untitled - Notepad", "screen_info returns the size, the pointer and the active window");

const fullShot = await call("capsulate_screenshot", { sessionId: SID });
check(isDeepStrictEqual(shotBodies.at(-1), { sessionId: SID }), "a screenshot without options asks for the whole screen as before");
check(
  fullShot.content?.[0]?.type === "image" && fullShot.content[0].mimeType === "image/png" && /^1280x800 PNG of the whole screen/.test(fullShot.content[1]?.text ?? ""),
  "a screenshot is the image first, then its size",
);
const smallShot = await call("capsulate_screenshot", { sessionId: SID, format: "jpeg", quality: 60, scale: 0.5, x: 100, y: 200, w: 400, h: 300 });
check(isDeepStrictEqual(shotBodies.at(-1), { sessionId: SID, format: "jpeg", quality: 60, scale: 0.5, x: 100, y: 200, w: 400, h: 300 }), "screenshot options reach the API");
check(
  smallShot.content?.[0]?.mimeType === "image/jpeg" && text(smallShot).includes("(100 + x / 0.5, 200 + y / 0.5) on the screen"),
  "a scaled region screenshot is a JPEG and says how its points map to the screen",
);

const steps26 = [
  { do: "open", target: "notepad", waitMs: 8000 },
  { do: "window", action: "move", title: "Notepad", x: 40, y: 30 },
  { do: "element", action: "set_value", selector: { role: "document" }, value: "dear diary" },
  { do: "wait_for", condition: "text", text: "dear diary", timeoutMs: 3000 },
  { do: "screen" },
];
const report26 = text(await call("capsulate_run_actions", { sessionId: SID, steps: steps26 }));
check(isDeepStrictEqual(runBodies.at(-1), { steps: steps26 }), "run_actions sends the new steps as given");
check(
  report26.startsWith("Ran 5 of 5 steps in 2.1 s.") &&
    report26.includes('1. open ok: opened app with notepad.exe, window "Untitled - Notepad" at 0, 0, 800x600') &&
    report26.includes('2. window ok: now window "Untitled - Notepad" at 40, 30, 800x600') &&
    report26.includes('3. element ok: document "Text editor" (focused)') &&
    report26.includes('4. wait_for ok: met after 75 ms: document "Text editor"') &&
    report26.includes('5. screen ok: 1280x800, pointer at 5, 6, active window "Untitled - Notepad"'),
  "each new step is one readable line",
);
check(!report26.includes("dear diary"), "the run report does not repeat a value that was set");

await client.close();
api.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall live MCP checks passed");
process.exit(failures ? 1 : 0);
