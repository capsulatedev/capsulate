// Public wire types for the Capsulate SDK.
//
// These mirror the platform's authoritative Go contracts (packages/contracts/*.go,
// generated to TS at packages/contracts/gen/contracts.ts) and the BFF route shapes
// (services/bff/src/index.ts). They are hand-curated here so the SDK is a
// self-contained, publishable artifact with a stable public surface. Field names
// match the JSON sent on the wire exactly.

/** A capsule's lifecycle state. `color = state` in the dashboard (§9). */
export type CapsuleStatus =
  | "PENDING"
  | "PROVISIONING"
  | "ACTIVE"
  | "SUSPENDED"
  | "DESTROYING"
  | "DESTROYED"
  | "ERROR"
  | string;

/** Options for launching a capsule (POST /sessions). */
export interface CreateCapsuleOptions {
  /** Golden-image / bundle / template id to boot, e.g. "ubuntu-22.04-headless". Required. */
  template: string;
  /** Resource size, e.g. "2c4g". Required. */
  size: string;
  /** Team that owns + pays for the capsule. Optional — resolved from the API key / first team when omitted. */
  teamId?: string;
  /** Region hint (ISO-3166 alpha-2). Omit for automatic placement. */
  region?: string;
  /** Software bundle (Bucket B marketplace) to launch from. */
  bundle?: string;
  /** Saved-template / snapshot id to restore from (clone-from-snapshot launch). */
  snapshot?: string;
  /** Persistent volume ids to attach once ACTIVE. */
  volumes?: string[];
  /** Environment variables injected before onStart runs. */
  env?: Record<string, string>;
  /** Shell script run once the capsule is ACTIVE. */
  onStart?: string;
  /** Shell script run just before teardown. */
  onDestroy?: string;
  /** Start an on-demand desktop recording on launch (desktop capsules). */
  record?: boolean;
  /** Your own SSH public key (desktop/headless); a password/key is generated otherwise. */
  ephemeralPublicKey?: string;
}

/** The capsule object returned by create / get / list. */
export interface Capsule {
  sessionId: string;
  userId?: string;
  teamId?: string;
  status: CapsuleStatus;
  templateId?: string;
  size?: string;
  region?: string;
  ephemeralUsername?: string;
  ephemeralSshKey?: string;
  ephemeralPassword?: string;
  connectionHost?: string;
  connectionPort?: number;
  connectionPortSsh?: number;
  privateIp?: string;
  workerId?: string;
  guacamoleUrl?: string;
  customPorts?: PortForward[];
  createdAt?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

export interface PortForward {
  name?: string;
  publicPort: number;
  privatePort: number;
}

/** Result of POST /sessions/:id/exec. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
  truncated?: boolean;
  [key: string]: unknown;
}

export interface ExecOptions {
  stdin?: string;
  cwd?: string;
  timeoutSec?: number;
}

export interface FileReadResult {
  path: string;
  contentB64: string;
  size?: number;
  truncated?: boolean;
  [key: string]: unknown;
}

export interface FileWriteResult {
  path: string;
  bytesWritten?: number;
  [key: string]: unknown;
}

export interface EnvSetResult {
  count?: number;
  [key: string]: unknown;
}

export interface ScreenshotResult {
  /** base64-encoded image, PNG unless asked for JPEG. */
  imageB64: string;
  width?: number;
  height?: number;
  format?: string;
  /** The scale applied (absent for 1) and the part of the screen captured (absent for all of it): a point in the
   *  image is at `region.x + x / scale` on the screen. */
  scale?: number;
  region?: { x: number; y: number; w: number; h: number };
  [key: string]: unknown;
}

/** LCU M2.6: fewer bytes travel faster. Without options a screenshot is the whole screen as PNG. */
export interface ScreenshotOptions {
  format?: "png" | "jpeg";
  /** JPEG quality, 1 to 100 (default 75). */
  quality?: number;
  /** Shrink to this fraction of the screen, 0.1 to 1. */
  scale?: number;
  /** Capture this region of the screen (w and h greater than 0). */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface InputResult {
  ok?: boolean;
  /** Present only when the action was called with `screenshot: true` — the frame after the action. */
  screenshot?: ScreenshotResult;
  [key: string]: unknown;
}

/**
 * Shared opts for the input verbs (click/type/key/move/scroll/drag) to capture a
 * screenshot once the action has been applied — act→observe in a single round-trip.
 */
export interface ScreenshotAfterOptions {
  /** Capture a screenshot after the action; it is returned on `InputResult.screenshot`. */
  screenshot?: boolean;
  /**
   * Settle delay (ms) before that screenshot so it reflects the result rather than a
   * mid-transition view. Capped server-side at 10000ms.
   */
  screenshotDelayMs?: number;
}

export type MouseButton = "left" | "right" | "middle";

// ── deep computer-use (Phase CU): structured introspection + rich primitives ──

/** One accessible UI element with on-screen bounds + a click-ready center (cx,cy). */
export interface UIElement {
  role: string;
  name?: string;
  value?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  states?: string[];
}

/** A UIElement plus its children — the recursive accessibility tree. */
export interface UINode extends UIElement {
  children?: UINode[];
}

export interface UITreeResult {
  /** "atspi" (Linux) | "uia" (Windows) | "none" (daemon absent — degrade to pixels). */
  backend: string;
  roots: UINode[];
  nodeCount?: number;
  truncated?: boolean;
  [key: string]: unknown;
}

/** Match an element by any combination of role / name / value text. */
export interface ElementSelector {
  role?: string;
  name?: string;
  /** match against name OR value. */
  text?: string;
  /** require exact (not substring) match. */
  exact?: boolean;
  /** require a state, e.g. "enabled" | "visible" | "focused". */
  state?: string;
}

export interface FindElementResult {
  backend: string;
  matches: UIElement[];
  count: number;
  [key: string]: unknown;
}

export interface WaitElementResult {
  backend: string;
  found: boolean;
  element?: UIElement;
  waitedMs?: number;
  [key: string]: unknown;
}

export interface ClipboardResult {
  text: string;
  [key: string]: unknown;
}

export interface WindowInfo {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  active?: boolean;
}

export interface WindowListResult {
  windows: WindowInfo[];
  [key: string]: unknown;
}

export interface OCRWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf?: number;
}

export interface OCRResult {
  backend: string;
  text: string;
  words?: OCRWord[];
  [key: string]: unknown;
}

// ── the complete toolset (LCU M2.6): act on elements and windows, open things, wait, read the screen ──

/** What an element action does to the element a selector finds. */
export type ElementAction =
  | "set_value"
  | "clear"
  | "toggle"
  | "expand"
  | "collapse"
  | "invoke"
  | "select"
  | "focus"
  | "scroll_into_view";

export interface ElementActionOptions {
  /** The text for set_value; for select, the name of the option to choose inside the element (a combo box or a
   *  list). */
  value?: string;
  /** Only within this window (a part of its title). */
  window?: string;
  /** Which match, when several do (0, the first, in find_element's order). */
  index?: number;
}

export interface ElementActionResult {
  backend: string;
  ok: boolean;
  /** How it was done: pattern (UI Automation), action or text (AT-SPI), keyboard (typed into the focused element). */
  method?: string;
  /** The element as it is afterwards: its value and states (checked, expanded, selected, focused). */
  element?: UIElement;
  [key: string]: unknown;
}

export type WindowAction = "focus" | "minimize" | "maximize" | "restore" | "close" | "move" | "resize";

export interface WindowActionResult {
  ok: boolean;
  /** The window as it is afterwards (absent once closed). */
  window?: WindowInfo;
  [key: string]: unknown;
}

export type OpenKind = "url" | "file" | "app";

export interface OpenResult {
  ok: boolean;
  kind: OpenKind;
  /** The app, desktop entry or handler that was started. */
  launched?: string;
  /** The new window, when asked to wait for it. */
  window?: WindowInfo;
  [key: string]: unknown;
}

/** present, absent, enabled and text are about elements (a selector); window about a window's title;
 *  screen_stable about the screen as a whole. */
export type WaitCondition = "present" | "absent" | "enabled" | "text" | "window" | "screen_stable";

export interface WaitForOptions {
  selector?: ElementSelector;
  /** The element conditions look only in this window; for the window condition it is the title to wait for. */
  window?: string;
  /** For text: what the element's name or value must contain. */
  text?: string;
  /** Default 10000, at most 120000. */
  timeoutMs?: number;
  /** For screen_stable: how long nothing may change (default 600). */
  stableMs?: number;
}

export interface WaitForResult {
  backend: string;
  /** Whether the condition held before the timeout. */
  met: boolean;
  waitedMs: number;
  element?: UIElement;
  window?: WindowInfo;
  [key: string]: unknown;
}

export interface ScreenInfoResult {
  width: number;
  height: number;
  cursor: { x: number; y: number };
  activeWindow?: WindowInfo;
  [key: string]: unknown;
}

// ── run report (Phase CU.5): structured action trace + artifacts = proof of work ──

export interface TraceEvent {
  at: string;
  action: string;
  detail?: Record<string, unknown>;
}

export interface TraceResult {
  sessionId: string;
  events: TraceEvent[];
  count: number;
  [key: string]: unknown;
}

export interface RunArtifact {
  path: string;
  contentB64?: string;
  bytes?: number;
  truncated?: boolean;
  error?: string;
}

/** A provable result of an agent run: the action trace + recordings + pulled deliverables. */
export interface RunReport {
  sessionId: string;
  trace: TraceEvent[];
  recordings: Recording[];
  artifacts: RunArtifact[];
}

export interface RecordingStatus {
  recording: boolean;
  startedAt?: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  teamId?: string;
  kind?: string;
  sizeBytes?: number;
  durationMs?: number;
  createdAt?: string;
  [key: string]: unknown;
}

export interface RecordingList {
  recordings: Recording[];
  [key: string]: unknown;
}

export interface Snapshot {
  id: string;
  sessionId?: string;
  teamId?: string;
  name?: string;
  sizeBytes?: number;
  golden?: string;
  version?: string;
  region?: string;
  nodeId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface SnapshotList {
  snapshots: Snapshot[];
  [key: string]: unknown;
}

/** A saved template ("Your templates" library — a launchable snapshot, §29). */
export interface Template {
  id: string;
  teamId?: string;
  name?: string;
  sizeBytes?: number;
  home?: string;
  createdAt?: string;
  [key: string]: unknown;
}

/** A Bucket-B marketplace bundle with live availability (§30). */
export interface Bundle {
  id: string;
  displayName?: string;
  description?: string;
  software?: string[];
  category?: string;
  icon?: string;
  availability?: "instant" | "on_demand" | "unavailable" | string;
  [key: string]: unknown;
}

export type VolumeHome = "local" | "storage" | string;

export interface Volume {
  id: string;
  teamId?: string;
  name: string;
  sizeGb: number;
  home?: VolumeHome;
  status?: string;
  attachedTo?: string | null;
  region?: string;
  nodeId?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface VolumeList {
  volumes: Volume[];
  [key: string]: unknown;
}

export interface CreateVolumeOptions {
  name: string;
  /** Size in gibibytes. */
  sizeGb: number;
  teamId?: string;
  region?: string;
}

export interface VolumeAttachResult {
  volume?: Volume;
  device?: string;
  mountPath?: string;
  [key: string]: unknown;
}

export interface TeamSummary {
  id: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

export interface BillingBalance {
  totalCredits: number;
  [key: string]: unknown;
}

export interface ApiKey {
  id: string;
  teamId: string;
  name: string;
  prefix: string;
  scopes: string[];
  spendCapCredits?: number | null;
  spendAlertThreshold?: number | null;
  spendUsedCredits?: number;
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreateApiKeyOptions {
  name: string;
  scopes: string[];
  spendCapCredits?: number;
  spendAlertThreshold?: number;
}

/** The plaintext key is returned exactly once, on creation. */
export interface CreatedApiKey {
  apiKey: ApiKey;
  key: string;
}

export type Permission = "read-only" | "interactive";

export interface GuestInvite {
  email: string;
  permission: Permission;
}

export interface GuestInviteResult {
  email: string;
  shareId: string;
  passkey: string;
  expiresAt: string;
  [key: string]: unknown;
}

export interface SessionGuest {
  id: string;
  sessionId: string;
  guestEmail: string;
  permission: Permission;
  status: string;
  createdAt?: string;
  expiresAt?: string;
  [key: string]: unknown;
}

// ---- Demo links (Path B) ----

export type DemoPermission = "interactive" | "read-only";

export interface DemoLink {
  id: string;
  teamId: string;
  name: string;
  templateId: string;
  size: string;
  region?: string;
  permission: DemoPermission;
  ttlMinutes: number;
  maxConcurrent: number;
  requireEmail: boolean;
  record: boolean;
  active: boolean;
  launchCount: number;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateDemoOptions {
  name: string;
  templateId: string;
  teamId?: string;
  size?: string;
  region?: string;
  permission?: DemoPermission;
  ttlMinutes?: number;
  maxConcurrent?: number;
  requireEmail?: boolean;
  record?: boolean;
}

export interface DemoSession {
  id: string;
  demoLinkId: string;
  sessionId: string;
  visitorEmail?: string;
  recordingId?: string;
  status: "active" | "ended";
  durationSeconds: number;
  startedAt: string;
  endedAt?: string;
  [key: string]: unknown;
}

/** Catalog artifact (golden image / template metadata). */
export interface CatalogArtifact {
  id: string;
  kind?: string;
  bucket?: string;
  status?: string;
  versions?: unknown[];
  [key: string]: unknown;
}

// ---- live computer use (Phase LCU): the shared screen, who drives it, console links ----

/** Who holds a desktop capsule's shared screen. */
export type ControlState = "free" | "agent" | "human";

/** The "who is driving" state of a desktop capsule's shared screen. */
/** How the AI's input plays on a watched screen (LCU M2.7). natural and presentation glide the pointer to each
 *  target, type at a readable rate and leave a beat between the steps of a run; fast (the default) is machine speed. */
export type Pace = "fast" | "natural" | "presentation";

export interface ControlStatus {
  sessionId: string;
  /** free: nobody holds it. agent: the AI is acting (each input renews a 45 s lease). human: a person holds it. */
  state: ControlState;
  /** Who made the latest change: agent | owner | link | system. */
  by?: string;
  /** The latest handoff message: what the AI asked a person to do, or what the person said handing back. */
  note?: string;
  /** True while the AI has handed the screen to a person and waits to get it back. */
  handoff?: boolean;
  since: string;
  /** When the AI's hold ends without further input (agent state only). */
  leaseUntil?: string;
  /** Increases on every change. */
  version: number;
  /** How the AI's input plays on this screen: natural or presentation; absent means fast. */
  pace?: Pace;
}

/** Result of one long-poll on the control state. */
export interface ControlWaitResult {
  /** False when the wait timed out with no change. */
  changed: boolean;
  control: ControlStatus;
}

/** Result of waiting for a person to hand the screen back. */
export interface HandbackResult {
  /** True when the screen came back (state is no longer human). False on timeout. */
  handedBack: boolean;
  control: ControlStatus;
  /** What the person said when handing back, if anything. */
  note?: string;
}

/** A console link: a signed, expiring URL that opens the live console without a login. */
export interface ConsoleLink {
  url: string;
  token: string;
  /** view: watch only. control: watch, take the screen and hand it back. */
  mode: "view" | "control";
  expiresAt: string;
}
