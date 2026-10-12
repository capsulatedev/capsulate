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
  /** Golden-image / bundle / template id to boot, e.g. "ubuntu-22.04-headless". Required unless `skill` names a
   *  skill whose environment says what to boot. */
  template?: string;
  /** Resource size, e.g. "2c4g". Required unless `skill` is given (the skill's size, else 2c4g). */
  size?: string;
  /**
   * Launch the capsule for a skill of the team (Phase SK, its name or skl_ id): what the launch leaves out comes
   * from the skill's environment (a saved template with the software set up, its size), and the skill's setup
   * procedure runs once the capsule is ACTIVE. How it went is in `capsule.data.skill`.
   */
  skill?: string;
  /** Launch from this version of the skill's environment (default the current version). */
  skillVersion?: number;
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
  /**
   * Makes the launch safe to send again: the same key returns the same capsule instead of launching a second one.
   * create() picks a random key when you leave this out, and asks again with it while the capsule is still being
   * created (a Windows capsule that is cold-created takes minutes) or when the network or a gateway drops the
   * request. Pass your own to resume a launch across processes.
   */
  idempotencyKey?: string;
  /** How long create() keeps asking for a capsule that is still being created, in ms (default 15 minutes). */
  createTimeoutMs?: number;
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
  /** The console shows the live shared screen (the screen the AI drives): every Linux desktop, and a Windows
   *  desktop on its VM screen. Console links, control and the live overlay apply. */
  sharedScreen?: boolean;
  /** The skill the capsule was launched for, and how its setup went (Phase SK). */
  skill?: SkillLaunch;
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

/**
 * A drag along a path (decision 55): pressed at the first point, released at the last. `smooth` draws a curve through
 * the points instead of straight segments, `closed` returns to the first point (eight points on a circle make a
 * circle), `stepMs` is the pause between two points (8 ms by default, slower on a watched pace).
 */
export interface StrokeOptions extends ScreenshotAfterOptions {
  smooth?: boolean;
  closed?: boolean;
  stepMs?: number;
  button?: MouseButton;
}

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

/**
 * How carefully the AI checks its work on a screen (decision 55): quick (plan the whole job, run it in as few runs as
 * possible, look only to learn something or when a step failed), balanced (the default) or careful (look after every
 * step).
 */
export type Care = "quick" | "balanced" | "careful";

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
  /**
   * Visible mode (Phase HYB): the person wants to watch the whole task, so do every step on the screen. Absent (off),
   * work through commands first (files, installs, settings, scripts, data) and use the screen when it matters.
   */
  visible?: boolean;
  /** How carefully the AI checks its work (decision 55): quick or careful; absent means balanced. */
  care?: Care;
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

// ---- Skills (Phase SK, decision 56): learn once, repeat in minutes ----

/** tool: operate an application (replayable); way: how an expert works (rules and examples the AI follows). */
export type SkillKind = "tool" | "way";
export type SkillStatus = "active" | "archived";
/** Every write makes a new version; only an approved version runs. */
export type SkillVersionState = "draft" | "proposed" | "current" | "old" | "rejected";
export type SkillSource = "ai" | "lesson" | "edit" | "fix" | "import" | "relearn" | "environment";

export interface SkillApp {
  name: string;
  version?: string;
  os?: "linux" | "windows";
}

export interface SkillStats {
  runs: number;
  succeeded: number;
  failed: number;
  avgMs?: number;
  replayedSteps: number;
  askedSteps: number;
  lastRunAt?: string;
  lastRunStatus?: string;
}

/** A skill in a team's library. currentVersion is the version that runs (absent while none is current). */
export interface Skill {
  skillId: string;
  teamId: string;
  ownerSubject?: string;
  name: string;
  description: string;
  kind: SkillKind;
  apps?: SkillApp[];
  status: SkillStatus;
  currentVersion?: number;
  latestVersion: number;
  stats: SkillStats;
  rehearseWeekly?: boolean;
  /** Who turned the weekly rehearsal on: it launches its capsules as them. */
  rehearseBy?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** A file of a skill folder besides SKILL.md and capsulate/skill.json. */
export interface SkillFile {
  path: string;
  size: number;
  sha256: string;
  contentType?: string;
}

export interface SkillCheckResult {
  name: string;
  ok: boolean;
  error?: string;
  ms?: number;
}

export interface SkillRehearsal {
  runId: string;
  status: "running" | "passed" | "failed";
  fingerprint?: SkillCheckResult[];
  checks?: SkillCheckResult[];
  error?: string;
  at: string;
  ms?: number;
}

/** Maps a frame's own coordinates to the screen: screen = origin + scale * (x, y); clamp keeps strokes inside. */
export interface Frame {
  origin: [number, number];
  scale: number;
  clamp?: [[number, number], [number, number]];
}

export interface SkillParam {
  type: "string" | "number" | "integer" | "boolean" | "point" | "points" | "object" | "array" | "any";
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  pattern?: string;
}

/** A step of a procedure: a run step, which may use {{param}}, `frame` and `save`, or a skill-only step (use,
 *  ask, check, pixel, menus). */
export type SkillStep = Record<string, unknown> & { do: string };

/** A named, parameterized list of steps. */
export interface SkillProcedure {
  description?: string;
  params?: Record<string, SkillParam>;
  steps: SkillStep[];
}

export interface SkillEnvironment {
  os?: "linux" | "windows";
  /** A catalog template (ubuntu-22.04-desktop). */
  image?: string;
  /** A saved template with the software installed (preferred). */
  snapshotId?: string;
  size?: string;
  /** A procedure run after a launch. */
  setup?: string;
  fingerprint?: Array<{ exec: string[]; contains?: string }>;
}

/** capsulate/skill.json: the part only Capsulate runs. */
export interface SkillSpec {
  schema?: number;
  kind?: SkillKind;
  apps?: SkillApp[];
  environment?: SkillEnvironment;
  frames?: Record<string, Frame>;
  inputs?: Record<string, SkillParam>;
  procedures?: Record<string, SkillProcedure>;
  checks?: Array<{ name: string; description?: string; steps: SkillStep[] }>;
  traps?: Array<{ title: string; detail?: string; fix?: string }>;
}

/** One immutable version of a skill's content. */
export interface SkillVersion {
  skillId: string;
  teamId?: string;
  version: number;
  state: SkillVersionState;
  source: SkillSource;
  sourceRef?: string;
  note?: string;
  /** SKILL.md (Agent Skills, agentskills.io); empty in version lists. */
  skillMd: string;
  spec: SkillSpec;
  files?: SkillFile[];
  rehearsal?: SkillRehearsal;
  createdBy?: string;
  createdAt: string;
  [key: string]: unknown;
}

/** A skill with one version's content (the current one unless another was asked for). */
export interface SkillDetail {
  skill: Skill;
  version?: SkillVersion;
}

export interface SkillFileInput {
  path: string;
  /** Text content, or contentB64 for bytes. */
  content?: string;
  contentB64?: string;
  contentType?: string;
}

/**
 * A skill or a new version. Give the SKILL.md whole (skillMd), or name, description and instructions (its Markdown
 * body). A new version keeps what it leaves out from its base version (default the latest). A new skill's first
 * version is current; a later one is proposed (current only with force, skipping the rehearsal).
 */
export interface SkillWriteInput {
  teamId?: string;
  skillMd?: string;
  name?: string;
  description?: string;
  instructions?: string;
  spec?: SkillSpec;
  files?: SkillFileInput[];
  removeFiles?: string[];
  note?: string;
  state?: "draft" | "proposed" | "current";
  force?: boolean;
  source?: SkillSource;
  sourceRef?: string;
  baseVersion?: number;
}

/** A skill folder as a zip (bytes or base64), or its parts. */
export interface SkillImportInput {
  teamId?: string;
  zip?: Uint8Array | ArrayBuffer;
  zipB64?: string;
  skillMd?: string;
  spec?: SkillSpec;
  files?: SkillFileInput[];
  state?: "draft" | "proposed" | "current";
  force?: boolean;
  note?: string;
}

/** What a capsule launched for a skill reports: the skill and version it was launched from, and when the skill has
 *  a setup procedure, how it went. The capsule is created either way. */
export interface SkillLaunch {
  skillId: string;
  name: string;
  version: number;
  setup?: string;
  /** The setup as one run step (`use`): ok, or the error of the step inside it that failed. */
  setupResult?: { i: number; do: string; ok: boolean; result?: unknown; status?: number; code?: string; error?: string; ms: number };
}

/** Save a capsule as a skill's environment: a saved template, then a version that launches from it. */
export interface SkillEnvironmentInput {
  sessionId: string;
  /** The procedure a launch runs once the capsule is ACTIVE ("" removes it; left out keeps the base version's). */
  setup?: string;
  /** Default the capsule's size. */
  size?: string;
  note?: string;
  /** The new version's state: proposed while another version is current (current with force). */
  state?: "draft" | "proposed" | "current";
  force?: boolean;
}

export interface SkillEnvironmentResult {
  snapshot: Snapshot;
  skill: Skill;
  version: SkillVersion;
}

/** A pixel's colour (POST /sessions/:id/pixel). */
export interface PixelResult {
  x: number;
  y: number;
  /** #rrggbb */
  color: string;
  r: number;
  g: number;
  b: number;
}

/** A menu entry; a top-level menu carries its items. */
export interface MenuItem {
  name: string;
  shortcut?: string;
  enabled: boolean;
  checked?: boolean;
  /** The entry opens a submenu. */
  submenu?: boolean;
  x?: number;
  y?: number;
  items?: MenuItem[];
}

/** A window's menu bar with every menu's items (POST /sessions/:id/menus). */
export interface MenusResult {
  window?: string;
  menus: MenuItem[];
}

// ---- Runs (Phase SK): a skill's procedure in the background, waiting for you where run_actions stops ----

export type RunStatus = "queued" | "running" | "needs_input" | "needs_help" | "succeeded" | "failed" | "cancelled";

/** Start a run: on a capsule (sessionId), or launch: true to start the skill's environment for it. */
export interface RunStartInput {
  teamId?: string;
  sessionId?: string;
  skill?: string;
  version?: number;
  /** The procedure to run (default main) when steps are left out. */
  procedure?: string;
  inputs?: Record<string, unknown>;
  /** Steps to run instead of a procedure; they may call the skill's procedures with use. */
  steps?: Array<Record<string, unknown> & { do: string }>;
  frames?: Record<string, { origin: [number, number]; scale: number; clamp?: [[number, number], [number, number]] }>;
  /** Launch a capsule from the skill's environment for the run (destroyed after, unless keep). */
  launch?: boolean;
  keep?: boolean;
  label?: string;
}

/** One executed step of a run. kind: replayed (as stored), asked, checked, fixed, skipped or failed. */
export interface RunStepRecord {
  seq: number;
  where?: string;
  i: number;
  do: string;
  kind: "replayed" | "asked" | "checked" | "fixed" | "skipped" | "failed";
  ok: boolean;
  error?: string;
  ms: number;
  result?: unknown;
  at: string;
}

/** What a waiting run needs: an answer (reason ask) or a way past a step (step_failed, check_failed,
 *  human_in_control, interrupted). */
export interface RunWaiting {
  reason: "ask" | "step_failed" | "check_failed" | "human_in_control" | "interrupted";
  question?: string;
  gives?: string[];
  options?: string[];
  context?: string;
  where?: string;
  step?: Record<string, unknown> & { do: string };
  error?: string;
  since: string;
}

export interface Run {
  runId: string;
  teamId: string;
  kind: "run" | "rehearsal";
  skillId?: string;
  skillName?: string;
  version?: number;
  procedure?: string;
  sessionId?: string;
  launched?: boolean;
  keep?: boolean;
  status: RunStatus;
  inputs?: Record<string, unknown>;
  startedBy?: string;
  label?: string;
  /** The timeline (the last 500 steps), or the steps after `after`. */
  steps?: RunStepRecord[];
  /** Steps executed so far. */
  done: number;
  replayed: number;
  asked: number;
  fixed: number;
  waiting?: RunWaiting;
  outcome?: { variables?: Record<string, unknown>; proposedVersion?: number; checks?: SkillCheckResult[]; fingerprint?: SkillCheckResult[] };
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  /** Time spent working (waiting for you does not count). */
  workMs: number;
}

/** Answer a waiting run: values (for an ask), steps to run instead, or action retry or skip. */
export interface RunContinueInput {
  values?: Record<string, unknown>;
  steps?: Array<Record<string, unknown> & { do: string }>;
  action?: "retry" | "skip";
  note?: string;
}

export interface RunListOptions {
  teamId?: string;
  skill?: string;
  sessionId?: string;
  status?: RunStatus | string;
  kind?: "run" | "rehearsal";
  limit?: number;
}

// ---- the inbox (Phase SK): what waits for someone in a team ----

export type InboxKind = "run_needs_input" | "run_needs_help" | "version_proposed" | "lesson_ready" | "rehearsal_failed" | "fingerprint_drift";

export interface InboxItem {
  kind: InboxKind;
  id: string;
  teamId: string;
  skillId?: string;
  skillName?: string;
  version?: number;
  runId?: string;
  lessonId?: string;
  title: string;
  detail?: string;
  at: string;
}

// ---- Lessons (Phase SK): teaching sessions a skill is learned from ----

export type LessonStatus = "recording" | "paused" | "processing" | "ready" | "failed" | "discarded";

export interface Lesson {
  lessonId: string;
  teamId: string;
  ownerSubject?: string;
  title: string;
  goal?: string;
  /** human: a person teaches on the shared screen; ai: the AI teaches itself with a goal. */
  mode: "human" | "ai";
  sessionId: string;
  os?: string;
  skillId?: string;
  status: LessonStatus;
  options: { video?: boolean; voice?: boolean; keyframes: boolean };
  artifacts: {
    /** The screen videos (Linux, when the lesson asked for video), one for each stretch it recorded (a pause ends one). */
    recordings?: string[];
    frames: number;
    audioChunks?: number;
    /** Some of the voice became text (the digest's voice). */
    transcript?: boolean;
    /** The voice's parts: a pause or the microphone turned off ends one. */
    audio?: Array<{ part: number; start: number; chunks: number; last?: boolean; done?: boolean; error?: string }>;
    envDiff?: LessonEnvDiff;
    draftSkill?: string;
    draftVersion?: number;
    /** What captures the person's input: xrecord (Linux), llhook (Windows), none (the capsule cannot). */
    recorder?: string;
  };
  eventCount: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
  pausedMs?: number;
}

/** What changed on the capsule during a lesson: packages installed, files changed, applications seen. */
export interface LessonEnvDiff {
  packages?: string[];
  files?: string[];
  apps?: string[];
}

export interface LessonStartInput {
  teamId?: string;
  title: string;
  /** What the lesson should achieve: the AI's goal, or what the person will show. */
  goal?: string;
  mode?: "human" | "ai";
  sessionId: string;
  /** A skill this lesson teaches or improves (name or skl_ id). */
  skillId?: string;
  video?: boolean;
  /** The teacher's voice is recorded (send it with lessons.addAudio) and turned into text. */
  voice?: boolean;
  noKeyframes?: boolean;
}

export interface LessonEvent {
  seq: number;
  /** ms after the lesson started (pauses left out). */
  t: number;
  actor: "human" | "ai" | "system";
  type: string;
  data?: Record<string, unknown>;
}

/** One step of a lesson in plain words; `step` is the action as a procedure step (an AI step as it ran, a person's
 *  from what the recorder saw: an element by its role and name where it saw one, else the place on the screen). */
export interface DigestStep {
  n: number;
  t: number;
  actor: string;
  type: string;
  window?: string;
  says: string;
  element?: { role?: string; name?: string; value?: string; x?: number; y?: number; w?: number; h?: number; path?: string[]; app?: string; window?: string; password?: boolean };
  text?: string;
  masked?: boolean;
  frame?: number;
  step?: Record<string, unknown> & { do: string };
  ok?: boolean;
}

/** A lesson ready to be turned into a skill. */
export interface LessonDigest {
  lesson: Lesson;
  steps: DigestStep[];
  omitted?: number;
  notes?: DigestStep[];
  voice?: Array<{ t: number; end: number; text: string }>;
  windows?: string[];
  envDiff?: LessonEnvDiff;
  frames?: number[];
  durationMs: number;
  /** How to turn the digest into a skill. */
  guide: string;
}
