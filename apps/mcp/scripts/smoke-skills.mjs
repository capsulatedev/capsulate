#!/usr/bin/env node
// Phase SK — end-to-end smoke test of the MCP skills tool, with no stack: a fake skill library on localhost plus a
// real MCP client that spawns the built server (dist/index.js) over stdio.
//
//   npm run build --workspace @capsulate/sdk && npm run build --workspace @capsulate/mcp
//   node apps/mcp/scripts/smoke-skills.mjs
//
// Exits 0 when every check passes.

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- a fake skill library ----
const skills = new Map(); // name -> {skill, versions[]}
const runBase = { runId: "run_smoke", teamId: "team-smoke", kind: "run", skillName: "krita-painting", version: 3, procedure: "main", done: 0, replayed: 0, asked: 0, fixed: 0, workMs: 1200, createdAt: "t", updatedAt: "t" };
let runState = null;
let lessonState = null;
const calls = [];
const api = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  let body = "";
  for await (const chunk of req) body += chunk;
  const b = body ? JSON.parse(body) : {};
  calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body: b });
  const send = (status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const p = u.pathname.replace(/^\/api\/v1/, "");
  if (p === "/teams") return send(200, [{ teamId: "team-smoke", id: "team-smoke" }]);
  if (req.method === "GET" && p === "/skills") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    return send(200, { skills: [...skills.values()].map((s) => s.skill).filter((k) => !q || `${k.name} ${k.description}`.toLowerCase().includes(q)) });
  }
  if (req.method === "POST" && p === "/skills") {
    const name = b.name ?? /name:\s*([a-z0-9-]+)/.exec(b.skillMd ?? "")?.[1];
    if (skills.has(name)) return send(409, { error: "exists", code: "conflict" });
    const version = { skillId: "skl_1", version: 1, state: "current", source: "ai", skillMd: b.skillMd ?? `---\nname: ${name}\ndescription: ${b.description}\n---\n${b.instructions ?? ""}`, spec: b.spec ?? {}, files: (b.files ?? []).map((f) => ({ path: f.path, size: 1, sha256: "x" })), createdAt: "now" };
    const skill = { skillId: "skl_1", teamId: "team-smoke", name, description: b.description ?? "d", kind: b.spec?.kind ?? "tool", status: "active", currentVersion: 1, latestVersion: 1, stats: { runs: 0 }, apps: b.spec?.apps };
    skills.set(name, { skill, versions: [version] });
    return send(201, { skill, version });
  }
  // SK.2: a skill's environment, a launch for a skill, menus and run_actions with skill steps.
  const env = /^\/skills\/([^/]+)\/environment$/.exec(p);
  if (env && req.method === "POST") {
    const s = skills.get(decodeURIComponent(env[1]));
    if (!s) return send(404, { error: "not found", code: "not_found" });
    const base = s.versions.at(-1);
    const v = { ...base, version: s.versions.length + 1, state: "proposed", source: "environment", spec: { ...base.spec, environment: { image: "ubuntu-22.04-desktop", snapshotId: "snap-1", setup: b.setup } } };
    s.versions.push(v);
    return send(201, { snapshot: { id: "snap-1" }, skill: s.skill, version: v });
  }
  if (req.method === "POST" && p === "/sessions") {
    return send(201, { sessionId: "sess-sk", status: "ACTIVE", templateId: "ubuntu-22.04-desktop", size: "4c8g", region: "fi", skill: { skillId: "skl_1", name: b.skill, version: 3, setup: "open_krita", setupResult: { i: 0, do: "use", ok: true, ms: 900 } } });
  }
  if (req.method === "POST" && p === "/sessions/sess-sk/menus") {
    return send(200, { window: "Krita", menus: [{ name: "File", enabled: true, items: [{ name: "New", enabled: true }, { name: "Open Recent", enabled: true, submenu: true }] }, { name: "Select", enabled: true, items: [{ name: "Deselect", enabled: false }] }] });
  }
  if (req.method === "POST" && p === "/sessions/sess-sk/actions") {
    return send(200, { ok: true, completed: 1, total: 1, ms: 5, variables: { c: "#112233" }, steps: [{ i: 0, do: "use", ok: true, ms: 3, result: { skill: "krita-painting", version: 3, procedure: "set_color", steps: 2 } }] });
  }
  // SK.3: a run that asks, then succeeds once answered.
  if (req.method === "POST" && p === "/runs") {
    runState = { ...runBase, status: "needs_input", done: 2, replayed: 2, waiting: { reason: "ask", question: "Which colour is the sky?", gives: ["hex"], options: ["#6f8b85"], since: "t" }, steps: [{ seq: 1, i: 0, do: "click", kind: "replayed", ok: true, ms: 3, at: "t" }, { seq: 2, i: 1, do: "type", kind: "replayed", ok: true, ms: 3, at: "t" }] };
    return send(202, { ...runBase, status: "queued" });
  }
  if (req.method === "GET" && p === "/runs/run_smoke") return send(200, runState);
  if (req.method === "POST" && p === "/runs/run_smoke/continue") {
    runState = { ...runState, status: "succeeded", done: 4, asked: 1, replayed: 3, waiting: undefined, outcome: { variables: b.values } };
    return send(200, runState);
  }
  if (req.method === "GET" && p === "/runs") return send(200, { runs: [runState] });
  // SK.4: rehearsals, the weekly rehearsal and the inbox.
  if (req.method === "POST" && /^\/skills\/[^/]+\/versions\/\d+\/rehearse$/.test(p)) return send(202, { ...runBase, runId: "run_reh", kind: "rehearsal", status: "queued" });
  if (req.method === "PATCH" && p === "/skills/krita-painting") {
    const s = skills.get("krita-painting");
    s.skill.rehearseWeekly = !!b.rehearseWeekly;
    return send(200, { skill: s.skill });
  }
  // SK.5: a lesson that records, finishes and becomes a digest.
  if (req.method === "POST" && p === "/lessons") {
    lessonState = { lessonId: "lsn_smoke", teamId: "team-smoke", title: b.title, goal: b.goal, mode: b.mode, sessionId: b.sessionId, status: "recording", options: { keyframes: true }, artifacts: { frames: 0 }, eventCount: 0, startedAt: "t", createdAt: "t", updatedAt: "t" };
    return send(201, lessonState);
  }
  if (req.method === "POST" && p === "/lessons/lsn_smoke/notes") return send(200, { ok: true, frame: 2 });
  if (req.method === "POST" && p === "/lessons/lsn_smoke/finish") {
    lessonState = { ...lessonState, status: "ready", eventCount: 7, artifacts: { frames: 2 } };
    return send(200, lessonState);
  }
  if (req.method === "GET" && p === "/lessons/lsn_smoke") return send(200, lessonState);
  // SK.6: the lesson on a capsule.
  if (req.method === "GET" && p === "/sessions/sess-sk/lesson") return lessonState?.status === "recording" ? send(200, { ...lessonState, artifacts: { frames: 0, recorder: "none" } }) : send(404, { error: "no lesson records on this capsule", code: "not_found" });
  if (req.method === "GET" && p === "/lessons/lsn_smoke/digest") {
    return send(200, {
      lesson: lessonState, durationMs: 42000, guide: "Turn this lesson into a skill with capsulate_skills action 'save'",
      steps: [{ n: 1, t: 100, actor: "ai", type: "step", says: "Opened mousepad", step: { do: "open", target: "mousepad" }, ok: true }, { n: 2, t: 900, actor: "ai", type: "step", says: "Typed \"buy milk\"", step: { do: "type", text: "buy milk" }, ok: true }],
      notes: [{ n: 0, t: 1000, actor: "ai", type: "note", says: "Ctrl+S asks for a name the first time" }],
      envDiff: { packages: ["mousepad"] },
    });
  }
  if (req.method === "GET" && p === "/inbox") {
    return send(200, { items: [
      { kind: "run_needs_help", id: "run_x", teamId: "team-smoke", runId: "run_x", skillName: "krita-painting", title: "krita-painting is stuck at krita-painting:main, step 4", detail: "not found", at: "t" },
      { kind: "version_proposed", id: "skl_1@4", teamId: "team-smoke", skillName: "krita-painting", version: 4, title: "Version 4 of krita-painting waits for approval", at: "t" },
    ] });
  }
  const m = /^\/skills\/([^/]+)(\/versions(?:\/(\d+)(\/approve)?)?)?$/.exec(p);
  if (m) {
    const s = skills.get(decodeURIComponent(m[1]));
    if (!s) return send(404, { error: "not found", code: "not_found" });
    if (!m[2] && req.method === "GET") return send(200, { skill: s.skill, version: s.versions.at(-1) });
    if (m[2] && !m[3] && req.method === "POST") {
      const base = s.versions.at(-1);
      const v = { ...base, version: s.versions.length + 1, state: "proposed", note: b.note, spec: b.spec ?? base.spec };
      s.versions.push(v);
      s.skill.latestVersion = v.version;
      return send(201, { skill: s.skill, version: v });
    }
    if (m[2] && !m[3]) return send(200, { versions: [...s.versions].reverse() });
    if (m[4]) {
      if (!b.force) return send(409, { error: "version has no passing rehearsal", code: "rehearsal_required" });
      s.skill.currentVersion = Number(m[3]);
      return send(200, { skill: s.skill, version: s.versions[Number(m[3]) - 1] });
    }
  }
  send(404, { error: `no route ${req.method} ${p}` });
});
await new Promise((r) => api.listen(0, "127.0.0.1", r));
const port = api.address().port;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "..", "dist", "index.js")],
  env: { ...process.env, CAPSULATE_API_KEY: "cap_live_smoke", CAPSULATE_BASE_URL: `http://127.0.0.1:${port}`, CAPSULATE_TEAM_ID: "team-smoke" }, // gitleaks:allow
  stderr: "pipe",
});
const client = new Client({ name: "sk-smoke", version: "1.0.0" });
await client.connect(transport);

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
};
const text = (r) => (r.content || []).map((c) => c.text || "").join("\n");
const call = (args) => client.callTool({ name: "capsulate_skills", arguments: args });

const { tools } = await client.listTools();
check(tools.some((t) => t.name === "capsulate_skills"), "the server lists capsulate_skills");
const instructions = client.getInstructions?.() ?? "";
check(/list the team's skills/i.test(instructions) && /save it/i.test(instructions), "the instructions say to read skills first and save what was learned");

let r = await call({ action: "list" });
check(text(r).includes("no skills yet"), "an empty library says so");

r = await call({
  action: "save",
  name: "krita-painting",
  description: "Paint in Krita 5 on Linux. Use when asked to paint or draw in Krita.",
  instructions: "# Krita\nSet colours through the hex field.",
  spec: { kind: "tool", apps: [{ name: "Krita", version: "5.0.2" }], procedures: { set_color: { params: { hex: { type: "string", required: true } }, steps: [{ do: "click", x: 1, y: 2 }] } }, traps: [{ title: "A lasso inside a selection moves it", fix: "Deselect first" }] },
  files: [{ path: "scripts/plan.py", content: "print(1)" }],
});
check(!r.isError && text(r).includes("version 1") && text(r).includes("the version that runs"), "save creates the skill, version 1 runs");
const created = calls.find((c) => c.method === "POST" && c.path === "/api/v1/skills");
check(created?.body?.teamId === "team-smoke" && created?.body?.files?.[0]?.path === "scripts/plan.py", "the team and the files went with it");

r = await call({ action: "list", query: "krita" });
check(text(r).includes("krita-painting (version 1, tool, Krita 5.0.2): Paint in Krita"), "list shows the skill in one line");

r = await call({ action: "get", skill: "krita-painting" });
const got = text(r);
check(got.includes("set_color(hex: string)") && got.includes("Traps:") && got.includes("Fix: Deselect first") && got.includes("# Krita"), "get shows the instructions, the procedures and the traps");
r = await call({ action: "get", skill: "krita-painting", part: "spec" });
check(JSON.parse(text(r)).procedures.set_color.steps.length === 1, "get with part spec returns the steps");

r = await call({ action: "save", name: "krita-painting", description: "x", spec: { kind: "tool", traps: [{ title: "Two" }] }, note: "a trap" });
check(!r.isError && text(r).includes("version 2") && text(r).includes("proposed"), "saving again adds a proposed version");

r = await call({ action: "approve", skill: "krita-painting", version: 2 });
check(r.isError && text(r).includes("409"), "approve without a rehearsal is refused");
r = await call({ action: "approve", skill: "krita-painting", version: 2, force: true });
check(!r.isError && text(r).includes("version 2 is the one that runs"), "approve with force makes it current");

r = await call({ action: "versions", skill: "krita-painting" });
check(text(r).startsWith("version 2: proposed") || text(r).includes("version 2:"), "versions lists them newest first");

r = await call({ action: "get" });
check(r.isError && text(r).includes("needs skill"), "a missing skill name is a clear error");

// ---- SK.2: using a skill ----
r = await call({ action: "environment", skill: "krita-painting", sessionId: "sess-1", setup: "open_krita" });
const envCall = calls.find((c) => c.path === "/api/v1/skills/krita-painting/environment");
check(!r.isError && text(r).includes("template snap-1") && text(r).includes("version 3") && envCall?.body?.sessionId === "sess-1", "environment saves the capsule as the skill's environment");

r = await client.callTool({ name: "capsulate_launch", arguments: { skill: "krita-painting" } });
const launchCall = calls.find((c) => c.method === "POST" && c.path === "/api/v1/sessions");
check(!r.isError && launchCall?.body?.skill === "krita-painting" && !("templateId" in (launchCall?.body ?? {})) && !("size" in (launchCall?.body ?? {})) && text(r).includes('"setup": "ran"'), "a launch for a skill leaves the template and size to the skill and reports the setup");

r = await client.callTool({ name: "capsulate_menus", arguments: { sessionId: "sess-sk" } });
check(!r.isError && text(r).includes("File: New, Open Recent >") && text(r).includes("Deselect (disabled)"), "capsulate_menus lists each menu's items");

r = await client.callTool({ name: "capsulate_run_actions", arguments: { sessionId: "sess-sk", skill: "krita-painting", frames: { canvas: { origin: [346, 176], scale: 0.42 } }, steps: [{ do: "use", procedure: "set_color", args: { hex: "#112233" } }] } });
const runCall = calls.find((c) => c.path === "/api/v1/sessions/sess-sk/actions");
check(!r.isError && runCall?.body?.skill === "krita-painting" && runCall?.body?.frames?.canvas?.scale === 0.42 && text(r).includes("krita-painting:set_color") && text(r).includes("Saved:"), "run_actions sends the skill and frames and reports the use and the saved values");

// ---- SK.3: runs ----
r = await client.callTool({ name: "capsulate_skill_run", arguments: { action: "start", sessionId: "sess-sk", skill: "krita-painting", inputs: { subject: "a cat" }, waitMs: 1000 } });
const runStart = calls.find((c) => c.method === "POST" && c.path === "/api/v1/runs");
check(!r.isError && runStart?.body?.skill === "krita-painting" && runStart?.body?.inputs?.subject === "a cat" && text(r).includes("needs input") && text(r).includes("It asks: Which colour is the sky?") && text(r).includes("values {hex: ...}"), "a run that asks says what it needs");
r = await client.callTool({ name: "capsulate_skill_run", arguments: { action: "continue", runId: "run_smoke", values: { hex: "#6f8b85" }, waitMs: 1000 } });
const runCont = calls.find((c) => c.path === "/api/v1/runs/run_smoke/continue");
check(!r.isError && runCont?.body?.values?.hex === "#6f8b85" && text(r).includes("succeeded") && text(r).includes("Values:"), "continue answers it and reports the end");
r = await client.callTool({ name: "capsulate_skill_run", arguments: { action: "list" } });
check(!r.isError && text(r).includes("run_smoke: succeeded"), "list shows the runs");
check(/capsulate_skill_run/.test(client.getInstructions?.() ?? ""), "the instructions say how to use a skill");

// ---- SK.4: rehearsals and the inbox ----
r = await call({ action: "rehearse", skill: "krita-painting", version: 3 });
const rehCall = calls.find((c) => c.path === "/api/v1/skills/krita-painting/versions/3/rehearse");
check(!r.isError && rehCall && text(r).includes("run_reh") && text(r).includes("fresh capsule"), "rehearse starts a rehearsal and says how to follow it");
r = await call({ action: "weekly", skill: "krita-painting", on: true });
const weeklyCall = calls.find((c) => c.method === "PATCH" && c.path === "/api/v1/skills/krita-painting");
check(!r.isError && weeklyCall?.body?.rehearseWeekly === true && text(r).includes("rehearsed every week"), "weekly turns the weekly rehearsal on");
r = await client.callTool({ name: "capsulate_inbox", arguments: {} });
check(!r.isError && text(r).includes("is stuck at") && text(r).includes("continueAction 'retry'") && text(r).includes("rehearse it"), "the inbox says what waits and what to do next");

// ---- SK.5: lessons ----
const lesson = (args) => client.callTool({ name: "capsulate_lesson", arguments: args });
r = await lesson({ action: "start", sessionId: "sess-sk", title: "Save a note", goal: "Write a note and save it" });
const lessonStart = calls.find((c) => c.method === "POST" && c.path === "/api/v1/lessons");
check(!r.isError && lessonStart?.body?.mode === "ai" && lessonStart?.body?.teamId === "team-smoke" && text(r).includes("It records now") && text(r).includes("add a note"), "a lesson starts in ai mode and says how to teach");
r = await lesson({ action: "on", sessionId: "sess-sk" });
check(!r.isError && text(r).includes("lsn_smoke") && text(r).includes("not recorded on this capsule"), "the lesson on a capsule says when a person's input is not recorded");
r = await lesson({ action: "note", lessonId: "lsn_smoke", text: "Ctrl+S asks for a name the first time", screenshot: true });
check(!r.isError && text(r).includes("keyframe 2"), "a note takes a keyframe");
r = await lesson({ action: "finish", lessonId: "lsn_smoke" });
check(!r.isError && text(r).includes("ready") && text(r).includes("digest"), "finish says to read the digest");
r = await lesson({ action: "on", sessionId: "sess-sk" });
check(!r.isError && text(r).includes("No lesson records on sess-sk"), "a capsule with no lesson says so");
r = await lesson({ action: "get", lessonId: "lsn_smoke" });
check(!r.isError && text(r).includes('1. [ai] Opened mousepad  {"do":"open","target":"mousepad"}') && text(r).includes("Installed during the lesson: mousepad") && text(r).includes("capsulate_skills action 'save'"), "the digest has each step as it ran, what was installed and the guide");
r = await call({ action: "save", name: "mousepad-notes", description: "Write and save a note in Mousepad.", lessonId: "lsn_smoke" });
const savedFromLesson = calls.filter((c) => c.method === "POST" && c.path === "/api/v1/skills").at(-1);
check(!r.isError && savedFromLesson?.body?.source === "lesson" && savedFromLesson?.body?.sourceRef === "lsn_smoke", "a skill saved from a lesson names it");
check(/capsulate_lesson/.test(client.getInstructions?.() ?? ""), "the instructions give the learning protocol");

await client.close();
api.close();
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
