// Capsules — the core resource. Launch, list, inspect, and drive isolated sandboxes.
// Every interaction method exists both here (capsules.exec(id, …)) and on the
// Capsule handle (capsule.exec(…)); they share one implementation (interaction.ts).

import type { ClientContext } from "../internal.js";
import * as I from "../interaction.js";
import { Capsule } from "../capsule.js";
import { Recordings } from "./recordings.js";
import { Snapshots } from "./snapshots.js";
import type {
  Capsule as CapsuleData,
  CreateCapsuleOptions,
  ExecResult,
  ExecOptions,
  FileReadResult,
  FileWriteResult,
  EnvSetResult,
  ScreenshotResult,
  InputResult,
  ScreenshotAfterOptions,
  MouseButton,
  UITreeResult,
  ElementSelector,
  FindElementResult,
  WaitElementResult,
  ClipboardResult,
  WindowListResult,
  OCRResult,
  TraceResult,
  Snapshot,
  ControlStatus,
  ControlWaitResult,
  HandbackResult,
  ConsoleLink,
} from "../types.js";

const enc = encodeURIComponent;

export class Capsules {
  readonly recordings: Recordings;
  readonly snapshots: Snapshots;

  constructor(private readonly ctx: ClientContext) {
    this.recordings = new Recordings(ctx.http);
    this.snapshots = new Snapshots(ctx.http);
  }

  /** Launch a new capsule. Returns a Capsule handle. */
  async create(opts: CreateCapsuleOptions): Promise<Capsule> {
    const teamId = await this.ctx.resolveTeamId(opts.teamId);
    const body: Record<string, unknown> = {
      templateId: opts.template,
      size: opts.size,
      teamId,
    };
    if (opts.region) body.region = opts.region;
    if (opts.bundle) body.bundleId = opts.bundle;
    if (opts.snapshot) body.snapshotId = opts.snapshot;
    if (opts.volumes?.length) body.volumeIds = opts.volumes;
    if (opts.env) body.env = opts.env;
    if (opts.onStart) body.onStart = opts.onStart;
    if (opts.onDestroy) body.onDestroy = opts.onDestroy;
    if (opts.record) body.record = true;
    if (opts.ephemeralPublicKey) body.ephemeralPublicKey = opts.ephemeralPublicKey;
    const data = await this.ctx.http.post<CapsuleData>(`/sessions`, body);
    return new Capsule(this.ctx, data);
  }

  /** Launch a capsule and wait until it is ACTIVE. */
  async launch(
    opts: CreateCapsuleOptions,
    wait: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<Capsule> {
    const c = await this.create(opts);
    if (c.status === "ACTIVE") return c;
    return c.waitUntilActive(wait);
  }

  /** List active capsules for a team. */
  async list(teamId?: string): Promise<CapsuleData[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    // The API answers `null` (not `[]`) when the team has none.
    return (await this.ctx.http.get<CapsuleData[] | null>(`/teams/${enc(tid)}/sessions/active`)) ?? [];
  }

  /** List a team's capsule history (destroyed capsules included). */
  async history(teamId?: string): Promise<CapsuleData[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return (await this.ctx.http.get<CapsuleData[] | null>(`/teams/${enc(tid)}/sessions/history`)) ?? [];
  }

  /** Fetch a single capsule as a handle. */
  async get(sessionId: string): Promise<Capsule> {
    const data = await this.ctx.http.get<CapsuleData>(`/sessions/${enc(sessionId)}`);
    return new Capsule(this.ctx, data);
  }

  destroy(sessionId: string): Promise<void> {
    return this.ctx.http.delete<void>(`/sessions/${enc(sessionId)}`);
  }
  suspend(sessionId: string): Promise<unknown> {
    return this.ctx.http.post(`/sessions/${enc(sessionId)}/suspend`);
  }
  resume(sessionId: string): Promise<unknown> {
    return this.ctx.http.post(`/sessions/${enc(sessionId)}/resume`);
  }

  // ---- interaction by id (parity with the Capsule handle) ----
  exec(sessionId: string, cmd: string[], opts?: ExecOptions): Promise<ExecResult> {
    return I.exec(this.ctx.http, sessionId, cmd, opts);
  }
  run(
    sessionId: string,
    code: string,
    opts?: { lang?: "python" | "node" | "bash" | "sh"; timeoutSec?: number; cwd?: string },
  ): Promise<ExecResult> {
    return I.run(this.ctx.http, sessionId, code, opts);
  }
  readFile(sessionId: string, path: string, maxBytes?: number): Promise<FileReadResult> {
    return I.readFile(this.ctx.http, sessionId, path, maxBytes);
  }
  readFileText(sessionId: string, path: string): Promise<string> {
    return I.readFileText(this.ctx.http, sessionId, path);
  }
  writeFile(
    sessionId: string,
    path: string,
    content: string | Uint8Array,
    opts?: { mode?: string; alreadyBase64?: boolean },
  ): Promise<FileWriteResult> {
    return I.writeFile(this.ctx.http, sessionId, path, content, opts);
  }
  setEnv(sessionId: string, vars: Record<string, string>, secret?: boolean): Promise<EnvSetResult> {
    return I.setEnv(this.ctx.http, sessionId, vars, secret);
  }
  screenshot(sessionId: string): Promise<ScreenshotResult> {
    return I.screenshot(this.ctx.http, sessionId);
  }
  click(
    sessionId: string,
    x: number,
    y: number,
    opts?: { button?: MouseButton; count?: number } & ScreenshotAfterOptions,
  ): Promise<InputResult> {
    return I.click(this.ctx.http, sessionId, x, y, opts);
  }
  move(sessionId: string, x: number, y: number, opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.move(this.ctx.http, sessionId, x, y, opts);
  }
  scroll(
    sessionId: string,
    x: number,
    y: number,
    dx: number,
    dy: number,
    opts?: ScreenshotAfterOptions,
  ): Promise<InputResult> {
    return I.scroll(this.ctx.http, sessionId, x, y, dx, dy, opts);
  }
  drag(
    sessionId: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    button?: MouseButton,
    opts?: ScreenshotAfterOptions,
  ): Promise<InputResult> {
    return I.drag(this.ctx.http, sessionId, x1, y1, x2, y2, button, opts);
  }
  type(sessionId: string, text: string, opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.typeText(this.ctx.http, sessionId, text, opts);
  }
  key(sessionId: string, keys: string[], opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.sendKeys(this.ctx.http, sessionId, keys, opts);
  }

  // ── deep computer-use (Phase CU) ──
  uiTree(
    sessionId: string,
    opts?: { maxDepth?: number; window?: string; interesting?: boolean },
  ): Promise<UITreeResult> {
    return I.uiTree(this.ctx.http, sessionId, opts);
  }
  findElement(
    sessionId: string,
    selector: ElementSelector,
    opts?: { limit?: number; window?: string },
  ): Promise<FindElementResult> {
    return I.findElement(this.ctx.http, sessionId, selector, opts);
  }
  waitElement(
    sessionId: string,
    selector: ElementSelector,
    opts?: { timeoutMs?: number; window?: string },
  ): Promise<WaitElementResult> {
    return I.waitElement(this.ctx.http, sessionId, selector, opts);
  }
  clipboardGet(sessionId: string): Promise<ClipboardResult> {
    return I.clipboardGet(this.ctx.http, sessionId);
  }
  clipboardSet(sessionId: string, text: string): Promise<InputResult> {
    return I.clipboardSet(this.ctx.http, sessionId, text);
  }
  windowList(sessionId: string): Promise<WindowListResult> {
    return I.windowList(this.ctx.http, sessionId);
  }
  windowFocus(sessionId: string, target: { id?: string; title?: string }): Promise<InputResult> {
    return I.windowFocus(this.ctx.http, sessionId, target);
  }
  ocr(
    sessionId: string,
    region?: { x?: number; y?: number; w?: number; h?: number },
  ): Promise<OCRResult> {
    return I.ocr(this.ctx.http, sessionId, region);
  }
  trace(sessionId: string): Promise<TraceResult> {
    return I.getTrace(this.ctx.http, sessionId);
  }

  // ── live computer use (Phase LCU): the shared screen, handoff, narration, console links ──

  /** Who is driving the capsule's shared screen: free, agent (the AI) or human. */
  control(sessionId: string): Promise<ControlStatus> {
    return I.getControl(this.ctx.http, sessionId);
  }
  /** Take the screen (as the AI by default with an API key; `as: "person"` to hold it for a person). */
  takeControl(sessionId: string, opts?: { as?: "agent" | "person"; note?: string }): Promise<ControlStatus> {
    return I.takeControl(this.ctx.http, sessionId, opts);
  }
  /** Let go of the screen. The AI can never release a person's hold. */
  releaseControl(sessionId: string, opts?: { as?: "agent" | "person"; note?: string }): Promise<ControlStatus> {
    return I.releaseControl(this.ctx.http, sessionId, opts);
  }
  /**
   * Hand the screen to a person with a note, and by default wait (up to `timeoutMs`, 10 min) until they
   * hand it back. Their note comes back in `note`.
   */
  async handoff(
    sessionId: string,
    note: string,
    opts: { wait?: boolean; timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<HandbackResult> {
    const st = await I.handoff(this.ctx.http, sessionId, note);
    if (opts.wait === false) return { handedBack: false, control: st };
    return I.waitForHandback(this.ctx.http, sessionId, opts);
  }
  /** Wait until a person hands the screen back (no-op when nobody holds it). */
  waitForHandback(sessionId: string, opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<HandbackResult> {
    return I.waitForHandback(this.ctx.http, sessionId, opts);
  }
  /** One long-poll (max 25 s) for the next control change. */
  waitControl(sessionId: string, opts?: { version?: number; timeoutSec?: number; signal?: AbortSignal }): Promise<ControlWaitResult> {
    return I.waitControl(this.ctx.http, sessionId, opts);
  }
  /** Show one line of narration on every live console of the capsule. */
  say(sessionId: string, text: string): Promise<void> {
    return I.say(this.ctx.http, sessionId, text);
  }
  /** Mint a console link: a signed, expiring URL that opens the live console without a login. */
  consoleLink(sessionId: string, opts?: { mode?: "view" | "control"; ttlSec?: number }): Promise<ConsoleLink> {
    return I.consoleLink(this.ctx.http, sessionId, opts);
  }
  /** End every console link of the capsule. */
  revokeConsoleLinks(sessionId: string): Promise<void> {
    return I.revokeConsoleLinks(this.ctx.http, sessionId);
  }

  // ── checkpoint / rollback by id (Phase CU.3 parity with the Capsule handle) ──
  //
  // Same HTTP paths as Capsule.checkpoint/listCheckpoints/rollback: a checkpoint IS a
  // snapshot (POST /sessions/:id/snapshot), and rollback is a clone-from-snapshot launch
  // (POST /sessions with snapshotId) that by default destroys the current capsule.

  /** Capture a checkpoint (snapshot) of a capsule's current disk state. */
  checkpoint(sessionId: string, opts: { name?: string } = {}): Promise<Snapshot> {
    return this.snapshots.create(sessionId, opts.name);
  }

  /** List a capsule's checkpoints (snapshots). */
  listCheckpoints(sessionId: string): Promise<Snapshot[]> {
    return this.snapshots.list(sessionId);
  }

  /**
   * Roll a capsule back to a checkpoint: launches a fresh capsule cloned from the
   * snapshot (same template/size/team as the current one) and returns its handle. The
   * current capsule is destroyed unless `destroyCurrent: false`. The restored capsule has
   * a NEW session id.
   */
  async rollback(
    sessionId: string,
    checkpointId: string,
    opts: { size?: string; destroyCurrent?: boolean } = {},
  ): Promise<Capsule> {
    const current = await this.get(sessionId);
    return current.rollback(checkpointId, opts);
  }
}
