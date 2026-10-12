// Runs (Phase SK, decision 56): a skill's procedure, or a list of steps, in the background. No 90-second limit;
// where run_actions stops, a run waits: an ask step waits for your answer, and a step that fails waits for a retry,
// a skip or the steps to run instead (kept as a proposed fix to the skill).
//
//   const run = await cap.runs.start({ sessionId: capsule.id, skill: "krita-painting", inputs: { subject: "a cat" } });
//   let r = await cap.runs.wait(run.runId);         // until it finishes or needs you
//   if (r.status === "needs_input") {                // r.waiting.question, r.waiting.gives
//     await cap.runs.answer(r.runId, { hex: "#6f8b85" });
//     r = await cap.runs.wait(r.runId);
//   }

import type { ClientContext } from "../internal.js";
import type { Run, RunContinueInput, RunListOptions, RunStartInput } from "../types.js";
import type { RunStep } from "../actions.js";

const enc = encodeURIComponent;

const finished = (s: string) => s === "succeeded" || s === "failed" || s === "cancelled";
const waiting = (s: string) => s === "needs_input" || s === "needs_help";

export class Runs {
  constructor(private readonly ctx: ClientContext) {}

  /** Start a run. With skill and no steps, its procedure runs (main by default) with inputs. */
  async start(input: RunStartInput): Promise<Run> {
    const body: Record<string, unknown> = { ...input };
    if (!body.teamId && !input.sessionId) {
      const tid = await this.ctx.resolveTeamId().catch(() => undefined);
      if (tid) body.teamId = tid;
    }
    return this.ctx.http.post<Run>("/runs", body);
  }

  /** The run. waitMs (at most 25000) waits for news; after (a done count) returns only the steps after it. */
  async get(runId: string, opts: { waitMs?: number; after?: number } = {}): Promise<Run> {
    const query: Record<string, string> = {};
    if (opts.waitMs) query.waitMs = String(Math.min(opts.waitMs, 25_000));
    if (opts.after !== undefined) query.after = String(opts.after);
    return this.ctx.http.get<Run>(`/runs/${enc(runId)}`, { query });
  }

  /**
   * Wait until the run finishes or needs you (needs_input, needs_help), long-polling. onProgress sees the steps as
   * they run. Gives up after timeoutMs (default 30 minutes) and returns the run as it is.
   */
  async wait(runId: string, opts: { timeoutMs?: number; onProgress?: (run: Run) => void } = {}): Promise<Run> {
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
    let after = -1;
    let full: Run | undefined;
    for (;;) {
      const r = await this.get(runId, { waitMs: 25_000, after: after < 0 ? undefined : after });
      if (full && r.steps) full = { ...r, steps: [...(full.steps ?? []), ...r.steps] };
      else full = r;
      if (r.steps?.length) opts.onProgress?.(r);
      after = r.done;
      if (finished(r.status) || waiting(r.status) || Date.now() >= deadline) return full;
    }
  }

  /** Answer a waiting run: values for its question, steps to run instead of a stuck step, or retry or skip. */
  async continue(runId: string, input: RunContinueInput): Promise<Run> {
    return this.ctx.http.post<Run>(`/runs/${enc(runId)}/continue`, input);
  }
  /** Answer the run's question with the values it asks for. */
  answer(runId: string, values: Record<string, unknown>, note?: string): Promise<Run> {
    return this.continue(runId, { values, note });
  }
  /** Run the stuck step again (after fixing what made it fail). */
  retry(runId: string): Promise<Run> {
    return this.continue(runId, { action: "retry" });
  }
  /** Go on without the stuck step. */
  skip(runId: string): Promise<Run> {
    return this.continue(runId, { action: "skip" });
  }
  /** Run these steps instead of the stuck one; they become a proposed version of the skill. */
  fix(runId: string, steps: RunStep[], note?: string): Promise<Run> {
    return this.continue(runId, { steps, note });
  }

  /** Stop the run (a waiting run at once, a running one at its next step). */
  async cancel(runId: string): Promise<Run> {
    return this.ctx.http.post<Run>(`/runs/${enc(runId)}/cancel`, {});
  }

  /** The team's runs, newest first, without their timelines. */
  async list(opts: RunListOptions = {}): Promise<Run[]> {
    const tid = opts.teamId ?? (await this.ctx.resolveTeamId().catch(() => undefined));
    const query: Record<string, string> = {};
    if (tid) query.teamId = tid;
    for (const k of ["skill", "sessionId", "status", "kind"] as const) {
      const v = opts[k];
      if (v) query[k] = v;
    }
    if (opts.limit) query.limit = String(opts.limit);
    const out = await this.ctx.http.get<{ runs: Run[] }>("/runs", { query });
    return out.runs ?? [];
  }
}
