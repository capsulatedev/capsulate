// Launch idempotency (2026-10-10): create() sends an Idempotency-Key and asks again with it while the API says the
// capsule is still being created, or when a gateway drops the request. Over a fake fetch, with the pauses shortened.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Capsulate, CapsulateError } from "./index.js";

type Answer = { status: number; body?: unknown } | "network";

function fakeLaunchApi(answers: Answer[]) {
  const keys: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    if (u.pathname !== "/api/v1/sessions") throw new Error("unexpected " + u.pathname);
    keys.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    const a = answers.shift();
    if (!a) throw new Error("no more answers");
    if (a === "network") throw new TypeError("fetch failed");
    return new Response(a.body === undefined ? "" : JSON.stringify(a.body), {
      status: a.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const cap = new Capsulate({ apiKey: "cap_live_test", baseUrl: "https://api.example.test", fetch: fetchImpl, teamId: "team-1" });
  return { cap, keys };
}

const capsule = { sessionId: "sess-w1", status: "ACTIVE", templateId: "windows-server-2022-desktop" };
const creating = { status: "CREATING", retryAfterSec: 0.01 };

test("a launch still creating is asked again with the same key until the capsule comes", async () => {
  const { cap, keys } = fakeLaunchApi([
    { status: 202, body: creating },
    { status: 202, body: creating },
    { status: 201, body: capsule },
  ]);
  const c = await cap.capsules.create({ template: "windows-server-2022-desktop", size: "2c4g" });
  assert.equal(c.id, "sess-w1");
  assert.equal(keys.length, 3);
  assert.ok(keys[0]!.length >= 8, "a key is always sent");
  assert.ok(keys.every((k) => k === keys[0]), "every attempt carries the same key");
});

test("a launch a gateway dropped is asked again with the same key", async () => {
  const { cap, keys } = fakeLaunchApi([{ status: 524, body: "timeout" }, { status: 201, body: capsule }]);
  const c = await cap.capsules.create({ template: "ubuntu-22.04-desktop", size: "2c4g", idempotencyKey: "my-key-0001" });
  assert.equal(c.id, "sess-w1");
  assert.deepEqual(keys, ["my-key-0001", "my-key-0001"]);
});

test("a refused launch is not asked again", async () => {
  const { cap, keys } = fakeLaunchApi([{ status: 503, body: { error: "no capacity", code: "no_capacity", retryable: true } }]);
  await assert.rejects(cap.capsules.create({ template: "ubuntu-22.04-desktop", size: "2c4g" }), (e: unknown) => {
    assert.ok(e instanceof CapsulateError);
    assert.equal(e.status, 503);
    return true;
  });
  assert.equal(keys.length, 1);
});

test("a network that keeps failing before any answer gives up", async (t) => {
  t.mock.timers?.enable?.({ apis: ["setTimeout"] });
  const { cap, keys } = fakeLaunchApi(["network", "network", "network", "network", "network", "network"]);
  const p = cap.capsules.create({ template: "ubuntu-22.04-desktop", size: "2c4g" });
  const failed = assert.rejects(p, (e: unknown) => e instanceof CapsulateError && e.status === 0);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setImmediate(r));
    t.mock.timers?.tick?.(10_000);
  }
  await failed;
  assert.equal(keys.length, 5, "four retries after the first try, then the error");
});

test("a launch still creating at the deadline names its key", async () => {
  const { cap } = fakeLaunchApi([{ status: 202, body: creating }, { status: 202, body: creating }]);
  await assert.rejects(
    cap.capsules.create({ template: "windows-server-2022-desktop", size: "2c4g", idempotencyKey: "key-at-deadline", createTimeoutMs: 1 }),
    (e: unknown) => e instanceof CapsulateError && e.status === 202 && e.message.includes("key-at-deadline"),
  );
});

test("a rollback asks again with one key while the restore is still being created", async () => {
  const restored = { sessionId: "sess-w2", status: "ACTIVE", templateId: "windows-server-2022-desktop" };
  const { cap, keys } = fakeLaunchApi([
    { status: 201, body: capsule },
    { status: 202, body: creating },
    { status: 524, body: "timeout" },
    { status: 201, body: restored },
  ]);
  const c = await cap.capsules.create({ template: "windows-server-2022-desktop", size: "2c4g" });
  const r = await c.rollback("snap-1", { destroyCurrent: false });
  assert.equal(r.id, "sess-w2");
  assert.equal(keys.length, 4);
  assert.notEqual(keys[1], keys[0], "the rollback is a launch of its own");
  assert.ok(keys[1] === keys[2] && keys[2] === keys[3], "the rollback asks again with its one key");
});
