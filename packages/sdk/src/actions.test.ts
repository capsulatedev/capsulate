// LCU M2.4 — SDK tests for run_actions, over a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate } from "./index.js";

type Call = { method: string; path: string; body: any };

function fakeApi(body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    calls.push({ method: init?.method || "GET", path: u.pathname.replace(/^\/api\/v1/, ""), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { cap: new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" }), calls };
}

test("runActions posts the steps as given, with observe, and returns the run report", async () => {
  const report = {
    ok: false, completed: 1, total: 2, stoppedAt: 1, stopReason: "human_in_control",
    steps: [
      { i: 0, do: "click_element", ok: true, ms: 310, result: { element: { name: "Save" } } },
      { i: 1, do: "type", ok: false, status: 409, code: "human_in_control", error: "A person is using this screen.", ms: 2 },
    ],
    observation: { i: 2, do: "screenshot", ok: true, ms: 220, result: { imageB64: "AAAA", format: "png" } },
    ms: 540,
  };
  const { cap, calls } = fakeApi(report);
  const steps = [
    { do: "click_element", selector: { name: "Save" } },
    { do: "type", text: "notes", expect: { selector: { name: "Saved" }, timeoutMs: 3000 }, optional: true },
  ];
  const r = await cap.capsules.runActions("sess-1", steps, { observe: "screenshot" });
  assert.equal(r.stopReason, "human_in_control");
  assert.equal(r.steps[1]!.code, "human_in_control");
  assert.equal(r.observation!.do, "screenshot");
  assert.deepEqual(calls, [{ method: "POST", path: "/sessions/sess-1/actions", body: { steps, observe: "screenshot" } }]);
});

test("a run without observe sends only the steps", async () => {
  const { cap, calls } = fakeApi({ ok: true, completed: 1, total: 1, steps: [], ms: 1 });
  await cap.capsules.runActions("sess-2", [{ do: "pause", ms: 100 }]);
  assert.deepEqual(Object.keys(calls[0]!.body), ["steps"]);
});

test("setPace posts the pace to /control/pace", async () => {
  const { cap, calls } = fakeApi({ sessionId: "sess-3", state: "free", since: "", version: 2, pace: "presentation" });
  const st = await cap.capsules.setPace("sess-3", "presentation");
  assert.equal(st.pace, "presentation");
  assert.deepEqual(calls, [{ method: "POST", path: "/sessions/sess-3/control/pace", body: { pace: "presentation" } }]);
});
