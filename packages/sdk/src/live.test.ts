// Phase LCU — SDK tests for the live shared screen calls, over a fake fetch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate, CapsulateError } from "./index.js";

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };

function fakeApi(handler: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const call: Call = {
      method: init?.method || "GET",
      path: u.pathname.replace(/^\/api\/v1/, ""),
      query: u.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const cap = new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" });
  return { cap, calls };
}

const ctl = (state: string, version: number, extra: Record<string, unknown> = {}) => ({
  sessionId: "sess-1",
  state,
  since: "2026-10-08T22:00:00Z",
  version,
  ...extra,
});

test("handoff hands the screen over and waits until the person hands it back", async () => {
  let waits = 0;
  const { cap, calls } = fakeApi((c) => {
    if (c.path === "/sessions/sess-1/control/handoff") return { body: ctl("human", 4, { handoff: true, note: (c.body as any).note }) };
    if (c.path === "/sessions/sess-1/control") return { body: ctl("human", 4, { handoff: true }) };
    if (c.path === "/sessions/sess-1/control/wait") {
      waits++;
      if (waits === 1) return { body: { changed: false, control: ctl("human", 4, { handoff: true }) } };
      return { body: { changed: true, control: ctl("free", 5, { by: "owner", note: "Signed in" }) } };
    }
    return { status: 404, body: { error: "unexpected " + c.path } };
  });
  const r = await cap.capsules.handoff("sess-1", "Please sign in to GitHub", { timeoutMs: 60_000 });
  assert.equal(r.handedBack, true);
  assert.equal(r.note, "Signed in");
  assert.equal(r.control.state, "free");
  assert.deepEqual((calls[0]!.body as any).note, "Please sign in to GitHub");
  const wait = calls.find((c) => c.path.endsWith("/control/wait"))!;
  assert.equal(wait.query.get("version"), "4");
  assert.ok(Number(wait.query.get("timeout")) <= 25);
});

test("waitForHandback returns at once when nobody holds the screen", async () => {
  const { cap, calls } = fakeApi(() => ({ body: ctl("agent", 2) }));
  const r = await cap.capsules.waitForHandback("sess-1");
  assert.equal(r.handedBack, true);
  assert.equal(calls.length, 1);
});

test("waitForHandback gives up at its deadline", async () => {
  const { cap } = fakeApi((c) =>
    c.path.endsWith("/wait") ? { body: { changed: false, control: ctl("human", 7) } } : { body: ctl("human", 7) },
  );
  const r = await cap.capsules.waitForHandback("sess-1", { timeoutMs: 1 });
  assert.equal(r.handedBack, false);
  assert.equal(r.control.state, "human");
});

test("a refused AI input is recognisable", async () => {
  const { cap } = fakeApi(() => ({ status: 409, body: { error: "human_in_control", control: ctl("human", 3) } }));
  await assert.rejects(
    () => cap.capsules.click("sess-1", 1, 2),
    (e: unknown) => e instanceof CapsulateError && e.isHumanInControl,
  );
});

test("consoleLink, say and control calls hit the documented routes", async () => {
  const { cap, calls } = fakeApi((c) => {
    if (c.path.endsWith("/console-link")) return { body: { url: "https://app.example.test/live/sess-1?t=x", token: "x", mode: "view", expiresAt: "2026-10-09T02:00:00Z" } };
    if (c.path.endsWith("/say")) return { body: { ok: true } };
    return { body: ctl("agent", 1) };
  });
  const link = await cap.capsules.consoleLink("sess-1", { mode: "view", ttlSec: 600 });
  assert.equal(link.mode, "view");
  await cap.capsules.say("sess-1", "Opening the browser");
  await cap.capsules.takeControl("sess-1");
  await cap.capsules.releaseControl("sess-1", { note: "done" });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    [
      "POST /sessions/sess-1/console-link",
      "POST /sessions/sess-1/say",
      "POST /sessions/sess-1/control/take",
      "POST /sessions/sess-1/control/release",
    ],
  );
  assert.deepEqual(calls[0]!.body, { mode: "view", ttlSec: 600 });
  assert.deepEqual(calls[1]!.body, { text: "Opening the browser" });
});
