// Launches that ask again (0.4.1). A launch carries an Idempotency-Key, so it can be sent again safely: while the
// capsule is still being created the API answers 202 {"status":"CREATING"}, and a gateway or the network may drop a
// long request (a cold Windows desktop, a restore from a checkpoint) without an answer. Asking again with the same
// key always reaches the one capsule this launch made. A refusal (no capacity, a policy) is never asked again.

import { CapsulateError } from "./errors.js";
import type { Http } from "./http.js";
import type { Capsule as CapsuleData } from "./types.js";

/** How a launch asks again. */
export interface LaunchRetryOptions {
  /** The launch's key; a random one when left out. The same key from the same user returns the same capsule. */
  idempotencyKey?: string;
  /** How long to keep asking for a capsule that is still being created, in ms (default 15 minutes). */
  createTimeoutMs?: number;
}

/** A launch the API is still working on (202): ask again with the same Idempotency-Key. */
interface LaunchPending {
  status: "CREATING";
  retryAfterSec?: number;
  message?: string;
}

const isLaunchPending = (d: unknown): d is LaunchPending =>
  !!d && typeof d === "object" && (d as { status?: unknown }).status === "CREATING" && !(d as { sessionId?: unknown }).sessionId;

/** The network or a gateway dropped the launch without the API's answer: with the key, asking again is safe. */
const isDroppedLaunch = (e: unknown): boolean => {
  if (!(e instanceof CapsulateError)) return false;
  const s = e.status;
  return s === 0 || s === 502 || s === 504 || (s >= 520 && s <= 524);
};

/** A launch dropped this many times in a row, before the API ever said it was creating, is an error. */
const maxDroppedLaunches = 4;

export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return `launch-${c.randomUUID()}`;
  const r = () => Math.random().toString(36).slice(2);
  return `launch-${Date.now().toString(36)}-${r()}${r()}`;
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** POST /sessions with a key, asking again until the capsule comes, a refusal, or the time limit. */
export async function postLaunch(http: Http, body: Record<string, unknown>, opts: LaunchRetryOptions = {}): Promise<CapsuleData> {
  const key = opts.idempotencyKey ?? newIdempotencyKey();
  const limitMs = opts.createTimeoutMs ?? 15 * 60_000;
  const deadline = Date.now() + limitMs;
  let creating = false;
  let dropped = 0;
  for (;;) {
    let data: CapsuleData | LaunchPending;
    try {
      data = await http.post<CapsuleData | LaunchPending>(`/sessions`, body, { headers: { "Idempotency-Key": key } });
    } catch (e) {
      dropped++;
      if (!isDroppedLaunch(e) || Date.now() >= deadline || (!creating && dropped > maxDroppedLaunches)) throw e;
      await pause(Math.min(2_000 * dropped, 10_000));
      continue;
    }
    dropped = 0;
    if (!isLaunchPending(data)) return data;
    creating = true;
    if (Date.now() >= deadline) {
      throw new CapsulateError(
        `The capsule is still being created after ${Math.round(limitMs / 1000)} s. ` +
          `Call create again with idempotencyKey "${key}" to get it.`,
        { status: 202, body: data, request: { method: "POST", path: "/sessions" } },
      );
    }
    await pause(Math.max(1, data.retryAfterSec ?? 5) * 1_000);
  }
}
