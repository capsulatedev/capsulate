// LCU M2.6 — SDK tests for the complete toolset, over a fake fetch: each call goes to its route with its body, and
// an action that could not happen surfaces as CapsulateError with its code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate, CapsulateError } from "./index.js";

type Call = { method: string; path: string; body: any };

function fakeApi(answer: (path: string) => { status: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const path = u.pathname.replace(/^\/api\/v1/, "");
    calls.push({ method: init?.method || "GET", path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answer(path);
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { cap: new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" }), calls };
}

const ok = (body: unknown) => () => ({ status: 200, body });

test("element, window, open, wait_for and screen go to their routes with their bodies", async () => {
  const { cap, calls } = fakeApi(ok({ ok: true }));
  await cap.capsules.elementAction("s1", "set_value", { role: "text" }, { value: "hi", window: "Notes" });
  await cap.capsules.windowAction("s1", "resize", { title: "Notes" }, { w: 800, h: 600 });
  await cap.capsules.open("s1", "https://capsulate.dev", { waitMs: 5000 });
  await cap.capsules.waitFor("s1", "absent", { selector: { role: "dialog" }, timeoutMs: 3000 });
  await cap.capsules.screenInfo("s1");
  await cap.capsules.screenshot("s1", { format: "jpeg", scale: 0.5 });
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/sessions/s1/element/set_value", "/sessions/s1/windows/resize", "/sessions/s1/open", "/sessions/s1/wait_for",
      "/sessions/s1/screen", "/sessions/s1/screenshot"],
  );
  assert.deepEqual(calls[0]!.body, { sessionId: "s1", selector: { role: "text" }, value: "hi", window: "Notes" });
  assert.deepEqual(calls[1]!.body, { sessionId: "s1", title: "Notes", w: 800, h: 600 });
  assert.deepEqual(calls[2]!.body, { sessionId: "s1", target: "https://capsulate.dev", waitMs: 5000 });
  assert.deepEqual(calls[3]!.body, { sessionId: "s1", condition: "absent", selector: { role: "dialog" }, timeoutMs: 3000 });
  assert.deepEqual(calls[5]!.body, { sessionId: "s1", format: "jpeg", scale: 0.5 });
});

test("the capsule handle has the same verbs, and setValue is set_value", async () => {
  const { cap, calls } = fakeApi((p) =>
    p.endsWith("/sessions/s2") ? { status: 200, body: { sessionId: "s2", status: "ACTIVE" } } : { status: 200, body: { ok: true, met: true } },
  );
  const c = await cap.capsules.get("s2");
  await c.setValue({ name: "Email" }, "a@b.c");
  const w = await c.waitFor("screen_stable", { stableMs: 800 });
  assert.equal(w.met, true);
  await c.open("Text Editor");
  const posts = calls.filter((x) => x.method === "POST");
  assert.equal(posts[0]!.path, "/sessions/s2/element/set_value");
  assert.equal(posts[0]!.body.value, "a@b.c");
  assert.deepEqual(posts[1]!.body, { sessionId: "s2", condition: "screen_stable", stableMs: 800 });
  assert.deepEqual(posts[2]!.body, { sessionId: "s2", target: "Text Editor" });
});

test("an element action that could not happen throws with its code", async () => {
  const { cap } = fakeApi(() => ({ status: 422, body: { error: "not_found", message: "no element matches the selector", action: "invoke" } }));
  await assert.rejects(
    () => cap.capsules.elementAction("s3", "invoke", { name: "Save" }),
    (e: unknown) => e instanceof CapsulateError && e.status === 422 && e.code === "not_found" && e.message === "no element matches the selector",
  );
});
