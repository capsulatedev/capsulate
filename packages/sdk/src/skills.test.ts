// Phase SK — SDK tests for the skill library, over a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate, CapsulateError } from "./index.js";

type Call = { method: string; path: string; query: Record<string, string>; body: any };

/** A fake API: each call gets the next queued answer ({status, body} or bytes). */
function fakeApi(answers: Array<{ status?: number; body?: unknown; bytes?: Uint8Array }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push({
      method: init?.method || "GET",
      path: u.pathname.replace(/^\/api\/v1/, ""),
      query: Object.fromEntries(u.searchParams),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const a = answers.shift() ?? { body: {} };
    if (a.bytes) return new Response(new Blob([a.bytes as BlobPart]), { status: 200, headers: { "content-type": "application/zip" } });
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { cap: new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" }), calls };
}

const detail = { skill: { skillId: "skl_1", name: "krita-painting", currentVersion: 1 }, version: { version: 1, state: "current" } };

test("list sends the team and the filters and unwraps the skills", async () => {
  const { cap, calls } = fakeApi([{ body: { skills: [{ skillId: "skl_1" }] } }]);
  const list = await cap.skills.list({ q: "krita", status: "active" });
  assert.equal(list.length, 1);
  assert.deepEqual(calls[0], { method: "GET", path: "/skills", query: { teamId: "team-1", q: "krita", status: "active" }, body: undefined });
});

test("a skill by name is looked up in the team; by id it needs none", async () => {
  const { cap, calls } = fakeApi([{ body: detail }, { body: detail }]);
  await cap.skills.get("krita-painting", { version: 2 });
  await cap.skills.get("skl_1");
  assert.deepEqual(calls[0]!.query, { teamId: "team-1", version: "2" });
  assert.equal(calls[0]!.path, "/skills/krita-painting");
  assert.deepEqual(calls[1]!.query, {});
});

test("save creates, and on a name clash adds a version to the existing skill", async () => {
  const { cap, calls } = fakeApi([
    { status: 409, body: { error: "exists", code: "conflict" } },
    { status: 201, body: { ...detail, version: { version: 2, state: "proposed" } } },
  ]);
  const md = "---\nname: krita-painting\ndescription: Paint.\n---\n";
  const d = await cap.skills.save({ skillMd: md, note: "a new trap" });
  assert.equal(d.version!.version, 2);
  assert.equal(calls[0]!.path, "/skills");
  assert.equal(calls[0]!.body.teamId, "team-1");
  assert.equal(calls[1]!.path, "/skills/krita-painting/versions");
  assert.equal(calls[1]!.body.note, "a new trap");
});

test("save rethrows what is not a name clash", async () => {
  const { cap } = fakeApi([{ status: 400, body: { error: "bad", code: "invalid_spec" } }]);
  await assert.rejects(() => cap.skills.save({ name: "x", description: "d" }), (e: unknown) => e instanceof CapsulateError && e.status === 400);
});

test("approve, reject, rollback and update post where they should", async () => {
  const { cap, calls } = fakeApi([{ body: detail }, { body: detail }, { body: detail }, { body: detail }]);
  await cap.skills.approve("skl_1", 3, { force: true });
  await cap.skills.reject("skl_1", 4);
  await cap.skills.rollback("skl_1", 1);
  await cap.skills.update("skl_1", { status: "archived" });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    "POST /skills/skl_1/versions/3/approve",
    "POST /skills/skl_1/versions/4/reject",
    "POST /skills/skl_1/rollback",
    "PATCH /skills/skl_1",
  ]);
  assert.deepEqual(calls[0]!.body, { force: true });
  assert.deepEqual(calls[2]!.body, { version: 1 });
});

test("export returns the zip's bytes and import sends them as base64", async () => {
  const zip = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  const { cap, calls } = fakeApi([{ bytes: zip }, { status: 201, body: detail }]);
  const got = await cap.skills.export("skl_1", { version: 1 });
  assert.deepEqual([...got], [...zip]);
  assert.deepEqual(calls[0]!.query, { version: "1" });
  await cap.skills.import({ zip: got });
  assert.equal(calls[1]!.path, "/skills/import");
  assert.equal(calls[1]!.body.zipB64, Buffer.from(zip).toString("base64"));
  assert.equal(calls[1]!.body.zip, undefined);
});

// ---- SK.2: using a skill ----

test("a launch for a skill sends the skill and leaves out what the skill's environment gives", async () => {
  const launched = {
    sessionId: "sess-1", status: "ACTIVE", templateId: "ubuntu-22.04-desktop",
    skill: { skillId: "skl_1", name: "krita-painting", version: 3, setup: "open_krita", setupResult: { i: 0, do: "use", ok: true, ms: 1200 } },
  };
  const { cap, calls } = fakeApi([{ status: 201, body: launched }]);
  const c = await cap.capsules.launch({ skill: "krita-painting" });
  assert.equal(calls[0]!.path, "/sessions");
  assert.deepEqual(calls[0]!.body, { teamId: "team-1", skill: "krita-painting" });
  assert.equal(c.data.skill?.version, 3);
  assert.equal(c.data.skill?.setupResult?.ok, true);
});

test("runActions sends the skill and the frames; pixel and menus post to their endpoints", async () => {
  const { cap, calls } = fakeApi([
    { body: { ok: true, completed: 1, total: 1, steps: [], ms: 5, variables: { sky: "#6f8b85" } } },
    { body: { x: 5, y: 6, color: "#0b1f5b", r: 11, g: 31, b: 91 } },
    { body: { window: "Krita", menus: [{ name: "File", enabled: true, items: [{ name: "New", enabled: true }] }] } },
  ]);
  const res = await cap.capsules.runActions("sess-1", [{ do: "use", procedure: "set_color", args: { hex: "#2a1c11" } }], {
    skill: "krita-painting", frames: { canvas: { origin: [346, 176], scale: 0.42, clamp: [[0, 0], [900, 1200]] } },
  });
  assert.equal(res.variables?.sky, "#6f8b85");
  const px = await cap.capsules.pixel("sess-1", 5, 6);
  const m = await cap.capsules.menus("sess-1", "Krita");
  const at = calls.findIndex((x) => x.path === "/sessions/sess-1/actions");
  assert.deepEqual(calls[at]!.body, {
    steps: [{ do: "use", procedure: "set_color", args: { hex: "#2a1c11" } }],
    skill: "krita-painting", frames: { canvas: { origin: [346, 176], scale: 0.42, clamp: [[0, 0], [900, 1200]] } },
  });
  assert.equal(px.color, "#0b1f5b");
  assert.deepEqual(calls[at + 1]!.body, { x: 5, y: 6 });
  assert.equal(calls[at + 2]!.path, "/sessions/sess-1/menus");
  assert.deepEqual(calls[at + 2]!.body, { window: "Krita" });
  assert.equal(m.menus[0]!.items![0]!.name, "New");
});

test("environment saves a capsule as the skill's environment", async () => {
  const { cap, calls } = fakeApi([{ status: 201, body: { snapshot: { id: "snap-1" }, skill: detail.skill, version: { version: 2, state: "proposed" } } }]);
  const r = await cap.skills.environment("krita-painting", { sessionId: "sess-1", setup: "open_krita" });
  assert.equal(r.snapshot.id, "snap-1");
  assert.equal(calls[0]!.path, "/skills/krita-painting/environment");
  assert.deepEqual(calls[0]!.query, { teamId: "team-1" });
  assert.deepEqual(calls[0]!.body, { sessionId: "sess-1", setup: "open_krita" });
});

// ---- SK.3: runs ----

const runBase = { runId: "run_1", teamId: "team-1", kind: "run", done: 0, replayed: 0, asked: 0, fixed: 0, createdAt: "t", updatedAt: "t", workMs: 0 };

test("runs.start sends the run; wait long-polls with after until the run needs you", async () => {
  const { cap, calls } = fakeApi([
    { status: 202, body: { ...runBase, status: "queued" } },
    { body: { ...runBase, status: "running", done: 2, steps: [{ seq: 1, i: 0, do: "click", kind: "replayed", ok: true, ms: 5, at: "t" }, { seq: 2, i: 1, do: "type", kind: "replayed", ok: true, ms: 5, at: "t" }] } },
    { body: { ...runBase, status: "needs_input", done: 3, steps: [{ seq: 3, i: 2, do: "ask", kind: "asked", ok: true, ms: 1, at: "t" }], waiting: { reason: "ask", question: "Which colour?", gives: ["hex"], since: "t" } } },
  ]);
  const run = await cap.runs.start({ sessionId: "sess-1", skill: "krita-painting", inputs: { subject: "a cat" } });
  assert.equal(run.status, "queued");
  assert.deepEqual(calls[0]!.body, { sessionId: "sess-1", skill: "krita-painting", inputs: { subject: "a cat" } });
  const seen: number[] = [];
  const r = await cap.runs.wait("run_1", { onProgress: (x) => seen.push(x.done) });
  assert.equal(r.status, "needs_input");
  assert.equal(r.waiting?.question, "Which colour?");
  assert.equal(r.steps?.length, 3);
  assert.deepEqual(seen, [2, 3]);
  assert.deepEqual(calls[1]!.query, { waitMs: "25000" });
  assert.deepEqual(calls[2]!.query, { waitMs: "25000", after: "2" });
});

test("runs answer, retry, skip, fix, cancel and list post where they should", async () => {
  const { cap, calls } = fakeApi([{}, {}, {}, {}, {}, { body: { runs: [{ ...runBase, status: "succeeded" }] } }]);
  await cap.runs.answer("run_1", { hex: "#000000" });
  await cap.runs.retry("run_1");
  await cap.runs.skip("run_1");
  await cap.runs.fix("run_1", [{ do: "key", keys: ["ctrl+v"] }], "paste instead");
  await cap.runs.cancel("run_1");
  const list = await cap.runs.list({ skill: "krita-painting", status: "needs_help" });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    "POST /runs/run_1/continue", "POST /runs/run_1/continue", "POST /runs/run_1/continue", "POST /runs/run_1/continue",
    "POST /runs/run_1/cancel", "GET /runs",
  ]);
  assert.deepEqual(calls[0]!.body, { values: { hex: "#000000" } });
  assert.deepEqual(calls[1]!.body, { action: "retry" });
  assert.deepEqual(calls[2]!.body, { action: "skip" });
  assert.deepEqual(calls[3]!.body, { steps: [{ do: "key", keys: ["ctrl+v"] }], note: "paste instead" });
  assert.deepEqual(calls[5]!.query, { teamId: "team-1", skill: "krita-painting", status: "needs_help" });
  assert.equal(list.length, 1);
});

test("a run that launches its capsule names the team", async () => {
  const { cap, calls } = fakeApi([{ status: 202, body: { ...runBase, status: "queued" } }]);
  await cap.runs.start({ skill: "krita-painting", launch: true, inputs: { subject: "x" } });
  assert.equal(calls[0]!.body.teamId, "team-1");
  assert.equal(calls[0]!.body.launch, true);
});

// ---- SK.4: rehearsals and the inbox ----

test("rehearse posts to the version, setWeekly patches the skill, the inbox lists what waits", async () => {
  const { cap, calls } = fakeApi([
    { status: 202, body: { ...runBase, kind: "rehearsal", status: "queued" } },
    { status: 202, body: { ...runBase, kind: "rehearsal", status: "queued" } },
    { body: { skill: { ...detail.skill, rehearseWeekly: true, rehearseBy: "sub-a" } } },
    { body: { items: [{ kind: "run_needs_input", id: "run_1", teamId: "team-1", title: "krita-painting asks: Which colour?", at: "t" }] } },
  ]);
  const run = await cap.skills.rehearse("krita-painting", 3);
  await cap.skills.rehearse("krita-painting", 3, { sessionId: "sess-1", keep: true });
  const d = await cap.skills.setWeekly("krita-painting", true);
  const items = await cap.inbox.list();
  assert.equal(run.kind, "rehearsal");
  assert.equal(calls[0]!.path, "/skills/krita-painting/versions/3/rehearse");
  assert.deepEqual(calls[0]!.body, {});
  assert.deepEqual(calls[1]!.body, { sessionId: "sess-1", keep: true });
  assert.deepEqual(calls[2]!.body, { rehearseWeekly: true });
  assert.equal(d.skill.rehearseBy, "sub-a");
  assert.equal(calls[3]!.path, "/inbox");
  assert.deepEqual(calls[3]!.query, { teamId: "team-1" });
  assert.equal(items[0]!.kind, "run_needs_input");
});

// ---- SK.5: lessons ----

test("lessons start, note, finish, digest and draft go where they should", async () => {
  const lesson = { lessonId: "lsn_1", teamId: "team-1", title: "Export a PDF", mode: "ai", sessionId: "sess-1", status: "recording", options: { keyframes: true }, artifacts: { frames: 0 }, eventCount: 0, startedAt: "t", createdAt: "t", updatedAt: "t" };
  const { cap, calls } = fakeApi([
    { status: 201, body: lesson },
    { body: { ok: true, frame: 3 } },
    { body: { ...lesson, status: "ready" } },
    { body: { lesson, steps: [{ n: 1, t: 10, actor: "ai", type: "step", says: "Clicked at 1, 2", step: { do: "click", x: 1, y: 2 }, ok: true }], durationMs: 900, guide: "Turn this lesson into a skill" } },
    { status: 201, body: detail },
    { body: { lessons: [lesson] } },
  ]);
  const l = await cap.lessons.start({ sessionId: "sess-1", title: "Export a PDF", goal: "Export the open document as PDF", mode: "ai" });
  const n = await cap.lessons.note(l.lessonId, "The export hides under Advanced", { screenshot: true });
  const done = await cap.lessons.finish(l.lessonId);
  const d = await cap.lessons.digest(l.lessonId);
  await cap.lessons.draft(l.lessonId, { skill: "pdf-export" });
  const list = await cap.lessons.list({ status: "ready" });
  assert.deepEqual(calls[0]!.body, { sessionId: "sess-1", title: "Export a PDF", goal: "Export the open document as PDF", mode: "ai", teamId: "team-1" });
  assert.equal(n.frame, 3);
  assert.deepEqual(calls[1]!.body, { text: "The export hides under Advanced", screenshot: true });
  assert.equal(calls[2]!.path, "/lessons/lsn_1/finish");
  assert.equal(done.status, "ready");
  assert.equal(d.steps[0]!.step?.do, "click");
  assert.deepEqual(calls[4]!.body, { skill: "pdf-export" });
  assert.deepEqual(calls[5]!.query, { teamId: "team-1", status: "ready" });
  assert.equal(list.length, 1);
});

// ---- SK.6: the lesson on a capsule ----

test("lessons.onCapsule gives the capsule's lesson, or null when none records", async () => {
  const lesson = { lessonId: "lsn_2", teamId: "team-1", title: "Teach", mode: "human", sessionId: "sess-1", status: "recording", options: { keyframes: true }, artifacts: { frames: 2, recorder: "llhook" }, eventCount: 9, startedAt: "t", createdAt: "t", updatedAt: "t" };
  const { cap, calls } = fakeApi([
    { body: lesson },
    { status: 404, body: { error: "no lesson records on this capsule", code: "not_found" } },
  ]);
  const l = await cap.lessons.onCapsule("sess-1");
  const none = await cap.lessons.onCapsule("sess-2");
  assert.equal(calls[0]!.path, "/sessions/sess-1/lesson");
  assert.equal(l?.artifacts.recorder, "llhook");
  assert.equal(none, null);
});

// ---- SK.7: a lesson's voice ----

test("lessons.addAudio sends a chunk of the voice as base64, in its part and place", async () => {
  const { cap, calls } = fakeApi([{ body: { part: 2, chunks: 1, last: false } }, { body: { part: 2, chunks: 1, last: true } }]);
  const r = await cap.lessons.addAudio("lsn_1", { part: 2, seq: 0, start: 4200, contentType: "audio/webm;codecs=opus", data: new Uint8Array([104, 105]) });
  await cap.lessons.addAudio("lsn_1", { part: 2, seq: 1, last: true, data: new Uint8Array() });
  assert.equal(calls[0]!.path, "/lessons/lsn_1/audio");
  assert.deepEqual(calls[0]!.body, { part: 2, seq: 0, start: 4200, contentType: "audio/webm;codecs=opus", data: "aGk=" });
  assert.deepEqual(calls[1]!.body, { part: 2, seq: 1, last: true, data: "" });
  assert.equal(r.chunks, 1);
});
