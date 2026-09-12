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
    return this.ctx.http.get<CapsuleData[]>(`/teams/${enc(tid)}/sessions/active`);
  }

  /** List a team's capsule history (destroyed capsules included). */
  async history(teamId?: string): Promise<CapsuleData[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<CapsuleData[]>(`/teams/${enc(tid)}/sessions/history`);
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
}
