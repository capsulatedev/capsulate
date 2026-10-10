// The high-level Capsule handle — a fluent object returned by capsules.create()/get()
// so you can drive a single capsule without repeating its id:
//
//   const c = await cap.capsules.create({ template: "ubuntu-22.04-headless", size: "2c4g" });
//   await c.exec(["python3", "-c", "print(42)"]);
//   await c.writeFile("/workspace/app.py", "print('hi')");
//   await c.destroy();

import { Browser } from "./browser.js";
import { postLaunch } from "./launch.js";
import { runActions, type RunActionsResult, type RunObserve, type RunStep } from "./actions.js";
import type { ClientContext } from "./internal.js";
import * as I from "./interaction.js";
import { Recordings } from "./resources/recordings.js";
import { Snapshots } from "./resources/snapshots.js";
import { Volumes } from "./resources/volumes.js";
import { Sharing, Ports } from "./resources/sharing.js";
import type {
  Capsule as CapsuleData,
  CapsuleStatus,
  ExecResult,
  ExecOptions,
  FileReadResult,
  FileWriteResult,
  EnvSetResult,
  ScreenshotResult,
  InputResult,
  ScreenshotAfterOptions,
  MouseButton,
  Snapshot,
  GuestInvite,
  GuestInviteResult,
  PortForward,
  VolumeAttachResult,
  UITreeResult,
  ElementSelector,
  FindElementResult,
  WaitElementResult,
  ClipboardResult,
  WindowListResult,
  OCRResult,
  ScreenshotOptions,
  ElementAction,
  ElementActionOptions,
  ElementActionResult,
  WindowAction,
  WindowActionResult,
  OpenKind,
  OpenResult,
  WaitCondition,
  WaitForOptions,
  WaitForResult,
  ScreenInfoResult,
  UIElement,
  TraceResult,
  RunReport,
  RunArtifact,
  ControlStatus,
  HandbackResult,
  ConsoleLink,
  Pace,
} from "./types.js";

export class Capsule {
  readonly id: string;
  /** The most recent raw capsule record. Refresh with `.refresh()`. */
  data: CapsuleData;

  private readonly ctx: ClientContext;
  readonly recordings: Recordings;
  readonly snapshots: Snapshots;
  readonly ports: Ports;
  private readonly volumes: Volumes;
  private readonly sharing: Sharing;

  constructor(ctx: ClientContext, data: CapsuleData) {
    this.ctx = ctx;
    this.data = data;
    this.id = data.sessionId;
    this.recordings = new Recordings(ctx.http);
    this.snapshots = new Snapshots(ctx.http);
    this.ports = new Ports(ctx.http);
    this.volumes = new Volumes(ctx);
    this.sharing = new Sharing(ctx.http);
  }

  get status(): CapsuleStatus {
    return this.data.status;
  }

  // ---- interaction ----
  exec(cmd: string[], opts?: ExecOptions): Promise<ExecResult> {
    return I.exec(this.ctx.http, this.id, cmd, opts);
  }
  run(
    code: string,
    opts?: { lang?: "python" | "node" | "bash" | "sh"; timeoutSec?: number; cwd?: string },
  ): Promise<ExecResult> {
    return I.run(this.ctx.http, this.id, code, opts);
  }
  readFile(path: string, maxBytes?: number): Promise<FileReadResult> {
    return I.readFile(this.ctx.http, this.id, path, maxBytes);
  }
  readFileText(path: string): Promise<string> {
    return I.readFileText(this.ctx.http, this.id, path);
  }
  writeFile(
    path: string,
    content: string | Uint8Array,
    opts?: { mode?: string; alreadyBase64?: boolean },
  ): Promise<FileWriteResult> {
    return I.writeFile(this.ctx.http, this.id, path, content, opts);
  }
  setEnv(vars: Record<string, string>, secret?: boolean): Promise<EnvSetResult> {
    return I.setEnv(this.ctx.http, this.id, vars, secret);
  }

  /** The browser fast path: this capsule's agent Chrome, driven at page speed (LCU M2). */
  get browser(): Browser {
    return new Browser(this.ctx.http, this.id);
  }

  /** Several steps in one call: they run back to back on the server and the run stops at the first that fails
   *  (LCU M2.4). See RunStep for the verbs; `observe` returns a look at the end. */
  runActions(steps: RunStep[], opts?: { observe?: RunObserve }): Promise<RunActionsResult> {
    return runActions(this.ctx.http, this.id, steps, opts);
  }

  // ---- computer-use ----
  /** The screen as PNG; with options as JPEG, scaled, or a region of it. */
  screenshot(opts?: ScreenshotOptions): Promise<ScreenshotResult> {
    return I.screenshot(this.ctx.http, this.id, opts);
  }
  click(
    x: number,
    y: number,
    opts?: { button?: MouseButton; count?: number } & ScreenshotAfterOptions,
  ): Promise<InputResult> {
    return I.click(this.ctx.http, this.id, x, y, opts);
  }
  move(x: number, y: number, opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.move(this.ctx.http, this.id, x, y, opts);
  }
  scroll(x: number, y: number, dx: number, dy: number, opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.scroll(this.ctx.http, this.id, x, y, dx, dy, opts);
  }
  drag(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    button?: MouseButton,
    opts?: ScreenshotAfterOptions,
  ): Promise<InputResult> {
    return I.drag(this.ctx.http, this.id, x1, y1, x2, y2, button, opts);
  }
  type(text: string, opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.typeText(this.ctx.http, this.id, text, opts);
  }
  key(keys: string[], opts?: ScreenshotAfterOptions): Promise<InputResult> {
    return I.sendKeys(this.ctx.http, this.id, keys, opts);
  }

  // ---- deep computer-use (Phase CU): structured introspection + rich primitives ----
  uiTree(opts?: { maxDepth?: number; window?: string; interesting?: boolean }): Promise<UITreeResult> {
    return I.uiTree(this.ctx.http, this.id, opts);
  }
  findElement(selector: ElementSelector, opts?: { limit?: number; window?: string }): Promise<FindElementResult> {
    return I.findElement(this.ctx.http, this.id, selector, opts);
  }
  waitElement(selector: ElementSelector, opts?: { timeoutMs?: number; window?: string }): Promise<WaitElementResult> {
    return I.waitElement(this.ctx.http, this.id, selector, opts);
  }
  clipboardGet(): Promise<ClipboardResult> {
    return I.clipboardGet(this.ctx.http, this.id);
  }
  clipboardSet(text: string): Promise<InputResult> {
    return I.clipboardSet(this.ctx.http, this.id, text);
  }
  windowList(): Promise<WindowListResult> {
    return I.windowList(this.ctx.http, this.id);
  }
  windowFocus(target: { id?: string; title?: string }): Promise<InputResult> {
    return I.windowFocus(this.ctx.http, this.id, target);
  }
  ocr(region?: { x?: number; y?: number; w?: number; h?: number }): Promise<OCRResult> {
    return I.ocr(this.ctx.http, this.id, region);
  }

  // ---- the complete toolset (LCU M2.6) ----

  /** Act on the element a selector finds, without coordinates (set_value, toggle, expand, invoke, select, ...).
   *  Throws CapsulateError 422 (code not_found or unsupported) when it could not happen. */
  elementAction(action: ElementAction, selector: ElementSelector, opts?: ElementActionOptions): Promise<ElementActionResult> {
    return I.elementAction(this.ctx.http, this.id, action, selector, opts);
  }
  /** Replace a field's text (or a slider's value) by element. */
  setValue(selector: ElementSelector, value: string, opts?: { window?: string; index?: number }): Promise<ElementActionResult> {
    return I.elementAction(this.ctx.http, this.id, "set_value", selector, { ...opts, value });
  }
  /** Minimize, maximize, restore, close, move ({x, y}), resize ({w, h}) or focus a window. */
  windowAction(
    action: WindowAction,
    target: { id?: string; title?: string },
    opts?: { x?: number; y?: number; w?: number; h?: number },
  ): Promise<WindowActionResult> {
    return I.windowAction(this.ctx.http, this.id, action, target, opts);
  }
  /** Open a URL, a file or an app by name; `waitMs` waits for its window. */
  open(target: string, opts?: { kind?: OpenKind; waitMs?: number }): Promise<OpenResult> {
    return I.open(this.ctx.http, this.id, target, opts);
  }
  /** Wait in the capsule until a condition holds: present, absent, enabled, text, window, screen_stable. */
  waitFor(condition: WaitCondition, opts?: WaitForOptions): Promise<WaitForResult> {
    return I.waitFor(this.ctx.http, this.id, condition, opts);
  }
  /** The screen's size, the pointer and the active window. */
  screenInfo(): Promise<ScreenInfoResult> {
    return I.screenInfo(this.ctx.http, this.id);
  }

  // ---- live computer use (Phase LCU): the shared screen, handoff, narration, console links ----

  /** Who is driving this capsule's shared screen: free, agent (the AI) or human. */
  control(): Promise<ControlStatus> {
    return I.getControl(this.ctx.http, this.id);
  }
  /** Take the screen (as the AI by default with an API key; `as: "person"` to hold it for a person). */
  takeControl(opts?: { as?: "agent" | "person"; note?: string }): Promise<ControlStatus> {
    return I.takeControl(this.ctx.http, this.id, opts);
  }
  /** Let go of the screen. The AI can never release a person's hold. */
  releaseControl(opts?: { as?: "agent" | "person"; note?: string }): Promise<ControlStatus> {
    return I.releaseControl(this.ctx.http, this.id, opts);
  }
  /** How the AI's input plays on this screen: "natural" or "presentation" while a person watches (LCU M2.7). */
  setPace(pace: Pace): Promise<ControlStatus> {
    return I.setPace(this.ctx.http, this.id, pace);
  }
  /**
   * Hand the screen to a person with a note ("Please sign in, then hand it back") and by default wait
   * (up to `timeoutMs`, 10 min) until they hand it back. Their note comes back in `note`.
   */
  async handoff(note: string, opts: { wait?: boolean; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<HandbackResult> {
    const st = await I.handoff(this.ctx.http, this.id, note);
    if (opts.wait === false) return { handedBack: false, control: st };
    return I.waitForHandback(this.ctx.http, this.id, opts);
  }
  /** Wait until a person hands the screen back (no-op when nobody holds it). */
  waitForHandback(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<HandbackResult> {
    return I.waitForHandback(this.ctx.http, this.id, opts);
  }
  /** Show one line of narration on every live console of the capsule. */
  say(text: string): Promise<void> {
    return I.say(this.ctx.http, this.id, text);
  }
  /** Mint a console link: a signed, expiring URL that opens the live console without a login. */
  consoleLink(opts?: { mode?: "view" | "control"; ttlSec?: number }): Promise<ConsoleLink> {
    return I.consoleLink(this.ctx.http, this.id, opts);
  }
  /** End every console link of this capsule. */
  revokeConsoleLinks(): Promise<void> {
    return I.revokeConsoleLinks(this.ctx.http, this.id);
  }

  // ---- composed reliable desktop ops (Phase CU.6: find → act → verify) ----
  //
  // These sit on top of the low-level verbs so an agent gets reliable "click the Save
  // button" semantics instead of raw pixel coordinates: locate a real accessible element,
  // act on its center, and (optionally) verify the expected post-condition — retrying on
  // transient failure. They gracefully no-op the introspection (backend="none") path by
  // surfacing a clear error so callers can fall back to pixel mode.

  /** Find an element (optionally waiting for it), click its center, and return it. */
  async findAndClick(
    selector: ElementSelector,
    opts: { button?: MouseButton; count?: number; waitMs?: number; window?: string } = {},
  ): Promise<UIElement> {
    const el = await this.locate(selector, { waitMs: opts.waitMs, window: opts.window });
    await this.click(el.cx, el.cy, { button: opts.button, count: opts.count });
    return el;
  }

  /** Click an element identified by its visible text/name. */
  clickText(text: string, opts?: { waitMs?: number; window?: string }): Promise<UIElement> {
    return this.findAndClick({ text }, opts);
  }

  /** Click into a named field and type into it (clears via triple-click + type). */
  async fillByName(
    name: string,
    value: string,
    opts: { waitMs?: number; window?: string; clear?: boolean } = {},
  ): Promise<UIElement> {
    const el = await this.locate({ name, role: "text" }, { waitMs: opts.waitMs, window: opts.window });
    await this.click(el.cx, el.cy, { count: opts.clear === false ? 1 : 3 });
    await this.type(value);
    return el;
  }

  /** Resolve a selector to a single element, waiting up to waitMs (default 0 = no wait). */
  async locate(
    selector: ElementSelector,
    opts: { waitMs?: number; window?: string } = {},
  ): Promise<UIElement> {
    if (opts.waitMs && opts.waitMs > 0) {
      const w = await this.waitElement(selector, { timeoutMs: opts.waitMs, window: opts.window });
      if (w.found && w.element) return w.element;
      throw new Error(`element not found within ${opts.waitMs}ms: ${JSON.stringify(selector)}`);
    }
    const r = await this.findElement(selector, { limit: 1, window: opts.window });
    if (r.backend === "none") {
      throw new Error("UI introspection unavailable on this capsule (no accessibility backend)");
    }
    const first = r.matches[0];
    if (!first) throw new Error(`element not found: ${JSON.stringify(selector)}`);
    return first;
  }

  /** True if an element matching the selector currently exists (verification primitive). */
  async verify(selector: ElementSelector, opts?: { window?: string }): Promise<boolean> {
    const r = await this.findElement(selector, { limit: 1, window: opts?.window });
    return r.count > 0;
  }

  // ---- run report (Phase CU.5): proof of work ----

  /** The live structured action trace — every interaction this run, in order. */
  trace(): Promise<TraceResult> {
    return I.getTrace(this.ctx.http, this.id);
  }

  /**
   * Assemble a provable "run report": the action trace + the capsule's recordings +
   * (optionally) the declared output files pulled out of the guest as deliverables.
   * The agent does the work, then hands back report() = recording + trace + artifacts.
   */
  async report(opts: { artifacts?: string[] } = {}): Promise<RunReport> {
    const [traceRes, recs] = await Promise.all([
      this.trace().catch(() => ({ sessionId: this.id, events: [], count: 0 }) as TraceResult),
      this.recordings.list(this.id).catch(() => []),
    ]);
    const artifacts: RunArtifact[] = [];
    for (const path of opts.artifacts ?? []) {
      try {
        const f = await I.readFile(this.ctx.http, this.id, path);
        artifacts.push({ path, contentB64: f.contentB64, bytes: f.size, truncated: f.truncated });
      } catch (e) {
        artifacts.push({ path, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { sessionId: this.id, trace: traceRes.events, recordings: recs, artifacts };
  }

  // ---- checkpoint / rollback (Phase CU.3) — reuse the battle-tested snapshot path ----
  //
  // An agent about to do something destructive can checkpoint(), then rollback() if it
  // goes wrong. A checkpoint IS a snapshot (node-local ZFS CoW delta); rollback restores
  // it as a FRESH capsule (clone-from-snapshot) and returns its handle — the original
  // session id is left behind (optionally destroyed). This composes existing endpoints, so
  // there is no new, less-tested rollback machinery.

  /** Capture a checkpoint (snapshot) of the capsule's current disk state. */
  checkpoint(name?: string): Promise<Snapshot> {
    return this.snapshots.create(this.id, name);
  }

  /** List this capsule's checkpoints (snapshots). */
  listCheckpoints(): Promise<Snapshot[]> {
    return this.snapshots.list(this.id);
  }

  /**
   * Roll back to a checkpoint: launch a fresh capsule cloned from the snapshot and return
   * its handle. By default the current (bad) capsule is destroyed. The new capsule has a
   * new session id + IP — use the returned handle from here on.
   */
  async rollback(
    checkpointId: string,
    opts: { size?: string; destroyCurrent?: boolean; idempotencyKey?: string; createTimeoutMs?: number } = {},
  ): Promise<Capsule> {
    const body: Record<string, unknown> = {
      snapshotId: checkpointId,
      templateId: this.data.templateId,
      size: opts.size ?? this.data.size,
      teamId: this.data.teamId,
    };
    // A restore boots a clone and, on Windows, prepares its desktop: minutes, so it asks again like a launch.
    const data = await postLaunch(this.ctx.http, body, { idempotencyKey: opts.idempotencyKey, createTimeoutMs: opts.createTimeoutMs });
    const restored = new Capsule(this.ctx, data);
    if (opts.destroyCurrent !== false) {
      try {
        await this.destroy();
      } catch {
        /* best-effort: the restored capsule is what matters */
      }
    }
    return restored;
  }

  // ---- convenience over sub-resources ----
  snapshot(name?: string): Promise<Snapshot> {
    return this.snapshots.create(this.id, name);
  }
  attachVolume(volumeId: string, opts?: { mountPath?: string; readOnly?: boolean }): Promise<VolumeAttachResult> {
    return this.volumes.attach(this.id, volumeId, opts);
  }
  share(guests: GuestInvite[]): Promise<GuestInviteResult[]> {
    return this.sharing.share(this.id, guests);
  }
  forwardPort(localPort: number, name?: string): Promise<PortForward> {
    return this.ports.forward(this.id, localPort, name);
  }

  // ---- lifecycle ----
  async refresh(): Promise<this> {
    this.data = await this.ctx.http.get<CapsuleData>(`/sessions/${encodeURIComponent(this.id)}`);
    return this;
  }
  suspend(): Promise<unknown> {
    return this.ctx.http.post(`/sessions/${encodeURIComponent(this.id)}/suspend`);
  }
  resume(): Promise<unknown> {
    return this.ctx.http.post(`/sessions/${encodeURIComponent(this.id)}/resume`);
  }
  destroy(): Promise<void> {
    return this.ctx.http.delete<void>(`/sessions/${encodeURIComponent(this.id)}`);
  }

  /** Poll until the capsule reaches ACTIVE (or a terminal/error state). */
  async waitUntilActive(opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<this> {
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
    const interval = opts.intervalMs ?? 2_000;
    while (Date.now() < deadline) {
      if (this.status === "ACTIVE") return this;
      if (this.status === "ERROR" || this.status === "DESTROYED") {
        throw new Error(`Capsule ${this.id} entered terminal state ${this.status}`);
      }
      await new Promise((r) => setTimeout(r, interval));
      await this.refresh();
    }
    throw new Error(`Timed out waiting for capsule ${this.id} to become ACTIVE`);
  }
}
