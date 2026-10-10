// LCU M2 — SDK tests for the browser fast path, over a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate, CapsulateError } from "./index.js";

type Call = { method: string; path: string; body: any };

function fakeApi(handler: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const call: Call = {
      method: init?.method || "GET",
      path: u.pathname.replace(/^\/api\/v1/, ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const cap = new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" });
  return { cap, calls };
}

test("browser verbs hit /browser/{verb} with the verb's own fields and unwrap the result", async () => {
  const { cap, calls } = fakeApi((c) => {
    const verb = c.path.split("/").pop();
    if (verb === "snapshot") return { body: { ok: true, result: { url: "https://x", title: "X", items: [{ ref: "e1", role: "link", name: "Docs" }], truncated: false }, driverMs: 5 } };
    if (verb === "click") return { body: { ok: true, result: { clicked: { ref: "e1", role: "link", name: "Docs" }, url: "https://x/docs" } } };
    return { body: { ok: true, result: { echo: verb } } };
  });
  const b = cap.capsules.browser("sess-1");
  const snap = await b.snapshot({ interactive: true });
  assert.equal(snap.items[0]!.ref, "e1");
  const clicked = await b.click({ ref: snap.items[0]!.ref });
  assert.equal(clicked.url, "https://x/docs");
  await b.fill({ selector: "#q" }, "hello", { submit: true });
  await b.press("Enter", "Tab");
  await b.open("https://capsulate.dev");
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [
    ["POST", "/sessions/sess-1/browser/snapshot"],
    ["POST", "/sessions/sess-1/browser/click"],
    ["POST", "/sessions/sess-1/browser/fill"],
    ["POST", "/sessions/sess-1/browser/press"],
    ["POST", "/sessions/sess-1/browser/open"],
  ]);
  assert.deepEqual(calls.map((c) => c.body), [
    { interactive: true },
    { ref: "e1" },
    { selector: "#q", value: "hello", submit: true },
    { keys: ["Enter", "Tab"] },
    { url: "https://capsulate.dev" },
  ]);
});

test("a driver failure throws with its message, the code kept on the body", async () => {
  const { cap } = fakeApi(() => ({ status: 422, body: { error: "browser_error", message: 'LookupError: no element named "Buy"', verb: "click" } }));
  await assert.rejects(cap.capsules.browser("sess-1").click({ text: "Buy" }), (e: unknown) => {
    assert.ok(e instanceof CapsulateError);
    assert.equal(e.status, 422);
    assert.match(e.message, /no element named "Buy"/);
    assert.equal((e.body as any).error, "browser_error");
    return true;
  });
});

test("the capsule handle exposes the same browser", async () => {
  const { cap, calls } = fakeApi((c) =>
    c.method === "GET"
      ? { body: { sessionId: "sess-9", status: "ACTIVE", templateId: "ubuntu-22.04-desktop" } }
      : { body: { ok: true, result: { text: "hi" } } },
  );
  const capsule = await cap.capsules.get("sess-9");
  const r = await capsule.browser.text();
  assert.equal(r.text, "hi");
  assert.equal(calls.at(-1)?.path, "/sessions/sess-9/browser/text");
});
