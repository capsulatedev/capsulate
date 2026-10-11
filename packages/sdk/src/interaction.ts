// The Capsule Interaction API (Phase 4/5) — exec, files, env, and computer-use —
// as standalone functions over the transport, so both `cap.capsules.exec(id, …)`
// and the high-level `capsule.exec(…)` handle share one implementation (§8 parity).

import type { Http } from "./http.js";
import { encodeBase64, decodeBase64 } from "./internal.js";
import type {
  ExecResult,
  ExecOptions,
  FileReadResult,
  FileWriteResult,
  EnvSetResult,
  ScreenshotResult,
  InputResult,
  ScreenshotAfterOptions,
  MouseButton,
  StrokeOptions,
  Care,
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
  TraceResult,
  ControlStatus,
  ControlWaitResult,
  HandbackResult,
  ConsoleLink,
  Pace,
} from "./types.js";

const enc = encodeURIComponent;

export async function exec(
  http: Http,
  sessionId: string,
  cmd: string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  return http.post<ExecResult>(`/sessions/${enc(sessionId)}/exec`, { sessionId, cmd, ...opts });
}

/**
 * Run a snippet of code in the capsule. Convenience over exec for common languages. On Windows use "powershell": it
 * runs in the desktop session's PowerShell, about 0.3 s (bash and python3 are Linux commands).
 */
export async function run(
  http: Http,
  sessionId: string,
  code: string,
  opts: { lang?: "python" | "node" | "bash" | "sh" | "powershell"; timeoutSec?: number; cwd?: string } = {},
): Promise<ExecResult> {
  const lang = opts.lang ?? "bash";
  let cmd: string[];
  switch (lang) {
    case "python":
      cmd = ["python3", "-c", code];
      break;
    case "node":
      cmd = ["node", "-e", code];
      break;
    case "powershell":
      cmd = ["powershell.exe", "-NoProfile", "-Command", code];
      break;
    case "bash":
    case "sh":
    default:
      cmd = ["/bin/sh", "-lc", code];
      break;
  }
  return exec(http, sessionId, cmd, { timeoutSec: opts.timeoutSec, cwd: opts.cwd });
}

export async function readFile(
  http: Http,
  sessionId: string,
  path: string,
  maxBytes?: number,
): Promise<FileReadResult> {
  return http.get<FileReadResult>(`/sessions/${enc(sessionId)}/files`, {
    query: { path, ...(maxBytes ? { maxBytes } : {}) },
  });
}

/** Read a text file and return its decoded UTF-8 contents. */
export async function readFileText(http: Http, sessionId: string, path: string): Promise<string> {
  const res = await readFile(http, sessionId, path);
  return decodeBase64(res.contentB64 ?? "");
}

export async function writeFile(
  http: Http,
  sessionId: string,
  path: string,
  content: string | Uint8Array,
  opts: { mode?: string; alreadyBase64?: boolean } = {},
): Promise<FileWriteResult> {
  let contentB64: string;
  if (opts.alreadyBase64 && typeof content === "string") {
    contentB64 = content;
  } else if (typeof content === "string") {
    contentB64 = encodeBase64(content);
  } else {
    contentB64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(content).toString("base64")
        : btoa(String.fromCharCode(...content));
  }
  return http.post<FileWriteResult>(`/sessions/${enc(sessionId)}/files`, {
    sessionId,
    path,
    contentB64,
    ...(opts.mode ? { mode: opts.mode } : {}),
  });
}

export async function setEnv(
  http: Http,
  sessionId: string,
  vars: Record<string, string>,
  secret = false,
): Promise<EnvSetResult> {
  return http.post<EnvSetResult>(`/sessions/${enc(sessionId)}/env`, { sessionId, vars, secret });
}

// ---- computer-use (desktop capsules) ----

/** The screen as PNG; with options as JPEG, scaled, or a region of it (LCU M2.6: fewer bytes travel faster). */
export async function screenshot(http: Http, sessionId: string, opts: ScreenshotOptions = {}): Promise<ScreenshotResult> {
  return http.post<ScreenshotResult>(`/sessions/${enc(sessionId)}/screenshot`, { sessionId, ...opts });
}

/** Spread the optional post-action screenshot fields into a request body (omits when unset). */
function shotFields(opts: ScreenshotAfterOptions): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (opts.screenshot) f.screenshot = true;
  if (opts.screenshotDelayMs != null) f.screenshotDelayMs = opts.screenshotDelayMs;
  return f;
}

export async function click(
  http: Http,
  sessionId: string,
  x: number,
  y: number,
  opts: { button?: MouseButton; count?: number } & ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/click`, {
    sessionId,
    x,
    y,
    button: opts.button ?? "left",
    count: opts.count ?? 1,
    ...shotFields(opts),
  });
}

export async function move(
  http: Http,
  sessionId: string,
  x: number,
  y: number,
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/move`, { sessionId, x, y, ...shotFields(opts) });
}

export async function scroll(
  http: Http,
  sessionId: string,
  x: number,
  y: number,
  dx: number,
  dy: number,
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/scroll`, { sessionId, x, y, dx, dy, ...shotFields(opts) });
}

export async function drag(
  http: Http,
  sessionId: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  button: MouseButton = "left",
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/drag`, {
    sessionId,
    x1,
    y1,
    x2,
    y2,
    button,
    ...shotFields(opts),
  });
}

/**
 * Drag along a path (decision 55): press at the first point, move through every point, release at the last. A curve,
 * a circle, a signature, any shape a hand draws; `smooth` curves through the points, `closed` returns to the start.
 */
export async function stroke(
  http: Http,
  sessionId: string,
  points: Array<[number, number]>,
  opts: StrokeOptions = {},
): Promise<InputResult> {
  const { smooth, closed, stepMs, button, ...shot } = opts;
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/drag`, {
    sessionId,
    path: points,
    ...(smooth ? { smooth } : {}),
    ...(closed ? { closed } : {}),
    ...(stepMs ? { stepMs } : {}),
    button: button ?? "left",
    ...shotFields(shot),
  });
}

export async function typeText(
  http: Http,
  sessionId: string,
  text: string,
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/type`, { sessionId, text, ...shotFields(opts) });
}

/**
 * Press keys in order. Each entry is one key or a "+"-joined chord (xdotool names): `["ctrl+c"]`,
 * `["ctrl+l", "Return"]`, `["alt+F4"]`. A bare modifier followed by a key is joined into a chord by the
 * API, so `["ctrl", "v"]` also pastes.
 */
export async function sendKeys(
  http: Http,
  sessionId: string,
  keys: string[],
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/key`, { sessionId, keys, ...shotFields(opts) });
}

// ---- deep computer-use (Phase CU): structured introspection + rich primitives ----

/** Capture the accessibility tree (AT-SPI on Linux / UIAutomation on Windows). */
export async function uiTree(
  http: Http,
  sessionId: string,
  opts: { maxDepth?: number; window?: string; interesting?: boolean } = {},
): Promise<UITreeResult> {
  return http.post<UITreeResult>(`/sessions/${enc(sessionId)}/ui_tree`, { sessionId, ...opts });
}

/** Find accessible elements matching a selector (topmost/most-specific first). */
export async function findElement(
  http: Http,
  sessionId: string,
  selector: ElementSelector,
  opts: { limit?: number; window?: string } = {},
): Promise<FindElementResult> {
  return http.post<FindElementResult>(`/sessions/${enc(sessionId)}/find_element`, {
    sessionId,
    selector,
    ...opts,
  });
}

/** Block (in-guest) until an element matching the selector appears, or the timeout. */
export async function waitElement(
  http: Http,
  sessionId: string,
  selector: ElementSelector,
  opts: { timeoutMs?: number; window?: string } = {},
): Promise<WaitElementResult> {
  return http.post<WaitElementResult>(`/sessions/${enc(sessionId)}/wait_element`, {
    sessionId,
    selector,
    ...opts,
  });
}

/** Read the desktop clipboard text. */
export async function clipboardGet(http: Http, sessionId: string): Promise<ClipboardResult> {
  return http.post<ClipboardResult>(`/sessions/${enc(sessionId)}/clipboard`, { sessionId });
}

/** Write text to the desktop clipboard. */
export async function clipboardSet(http: Http, sessionId: string, text: string): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/clipboard/set`, { sessionId, text });
}

/** Enumerate top-level windows. */
export async function windowList(http: Http, sessionId: string): Promise<WindowListResult> {
  return http.post<WindowListResult>(`/sessions/${enc(sessionId)}/windows`, { sessionId });
}

/** Raise/focus a window by id or (substring of) title. */
export async function windowFocus(
  http: Http,
  sessionId: string,
  target: { id?: string; title?: string },
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/windows/focus`, { sessionId, ...target });
}

/** OCR the screen (or a sub-region when w>0 && h>0) for text not in the a11y tree. */
export async function ocr(
  http: Http,
  sessionId: string,
  region: { x?: number; y?: number; w?: number; h?: number } = {},
): Promise<OCRResult> {
  return http.post<OCRResult>(`/sessions/${enc(sessionId)}/ocr`, { sessionId, ...region });
}

// ---- the complete toolset (LCU M2.6) ----

/**
 * Act on the element a selector finds, without coordinates: set its value, clear, toggle, expand, collapse,
 * invoke (its default action), select (or choose an option inside it by name), focus, scroll it into view.
 * Throws CapsulateError (422) with code not_found or unsupported when it could not happen.
 */
export async function elementAction(
  http: Http,
  sessionId: string,
  action: ElementAction,
  selector: ElementSelector,
  opts: ElementActionOptions = {},
): Promise<ElementActionResult> {
  return http.post<ElementActionResult>(`/sessions/${enc(sessionId)}/element/${enc(action)}`, {
    sessionId,
    selector,
    ...opts,
  });
}

/** Minimize, maximize, restore, close, move ({x, y}), resize ({w, h}) or focus a window, by id or a part of its title. */
export async function windowAction(
  http: Http,
  sessionId: string,
  action: WindowAction,
  target: { id?: string; title?: string },
  opts: { x?: number; y?: number; w?: number; h?: number } = {},
): Promise<WindowActionResult> {
  return http.post<WindowActionResult>(`/sessions/${enc(sessionId)}/windows/${enc(action)}`, {
    sessionId,
    ...target,
    ...opts,
  });
}

/**
 * Open a URL (the default browser), a file (its default app) or an app by name (a Linux desktop entry, a Windows
 * Start menu entry or a program on the path). The kind is guessed from the target unless given; `waitMs` waits
 * for the new window and returns it.
 */
export async function open(
  http: Http,
  sessionId: string,
  target: string,
  opts: { kind?: OpenKind; waitMs?: number } = {},
): Promise<OpenResult> {
  return http.post<OpenResult>(`/sessions/${enc(sessionId)}/open`, { sessionId, target, ...opts });
}

/** Wait in the capsule until a condition holds (or the timeout ends); the wait never holds up other calls. */
export async function waitFor(
  http: Http,
  sessionId: string,
  condition: WaitCondition,
  opts: WaitForOptions = {},
): Promise<WaitForResult> {
  return http.post<WaitForResult>(`/sessions/${enc(sessionId)}/wait_for`, { sessionId, condition, ...opts });
}

/** The screen's size, the pointer's position and the active window. */
export async function screenInfo(http: Http, sessionId: string): Promise<ScreenInfoResult> {
  return http.post<ScreenInfoResult>(`/sessions/${enc(sessionId)}/screen`, { sessionId });
}

/** The live structured action trace (Phase CU.5) — every interaction this run, in order. */
export async function getTrace(http: Http, sessionId: string): Promise<TraceResult> {
  return http.get<TraceResult>(`/sessions/${enc(sessionId)}/trace`);
}

// ---- live computer use (Phase LCU): who drives the shared screen, handoff, narration ----

/** The current "who is driving" state of a desktop capsule's shared screen. */
export async function getControl(http: Http, sessionId: string): Promise<ControlStatus> {
  return http.get<ControlStatus>(`/sessions/${enc(sessionId)}/control`);
}

/**
 * Take the screen. With an API key the caller is the AI unless `as: "person"`; the AI is refused
 * (409 human_in_control) while a person holds the screen.
 */
export async function takeControl(
  http: Http,
  sessionId: string,
  opts: { as?: "agent" | "person"; note?: string } = {},
): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/take`, { as: opts.as, note: opts.note });
}

/** Let go of the screen. The AI can only release its own hold, never a person's. */
export async function releaseControl(
  http: Http,
  sessionId: string,
  opts: { as?: "agent" | "person"; note?: string } = {},
): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/release`, { as: opts.as, note: opts.note });
}

/** Set how the AI's input plays on the screen (LCU M2.7): "natural" or "presentation" for a person watching. */
export async function setPace(http: Http, sessionId: string, pace: Pace): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/pace`, { pace });
}

/** Visible mode (Phase HYB): on, the AI is asked to do every step on the screen; off, commands first. */
export async function setVisible(http: Http, sessionId: string, visible: boolean): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/visible`, { visible });
}

/** How carefully the AI checks its work (decision 55): quick, balanced (the default) or careful. */
export async function setCare(http: Http, sessionId: string, care: Care): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/care`, { care });
}

/** Hand the screen to a person with a note saying what you need ("Please sign in, then hand it back"). */
export async function handoff(http: Http, sessionId: string, note: string): Promise<ControlStatus> {
  return http.post<ControlStatus>(`/sessions/${enc(sessionId)}/control/handoff`, { note });
}

/** One long-poll (max 25 s): returns when the control version moves past `version`, or on timeout. */
export async function waitControl(
  http: Http,
  sessionId: string,
  opts: { version?: number; timeoutSec?: number; signal?: AbortSignal } = {},
): Promise<ControlWaitResult> {
  return http.get<ControlWaitResult>(`/sessions/${enc(sessionId)}/control/wait`, {
    query: { version: opts.version, timeout: opts.timeoutSec },
    signal: opts.signal,
  });
}

/** Wait until a person hands the screen back (state no longer human), up to `timeoutMs` (default 10 min). */
export async function waitForHandback(
  http: Http,
  sessionId: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<HandbackResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  let st = await getControl(http, sessionId);
  while (st.state === "human") {
    const left = deadline - Date.now();
    if (left <= 0 || opts.signal?.aborted) return { handedBack: false, control: st };
    const timeoutSec = Math.max(1, Math.min(25, Math.ceil(left / 1000)));
    const r = await waitControl(http, sessionId, { version: st.version, timeoutSec, signal: opts.signal });
    st = r.control;
  }
  return { handedBack: true, control: st, note: st.note || undefined };
}

/** One line of narration, shown live on every console watching the capsule. */
export async function say(http: Http, sessionId: string, text: string): Promise<void> {
  await http.post(`/sessions/${enc(sessionId)}/say`, { text });
}

/** Mint a console link: a signed, expiring URL that opens the live console without a login. */
export async function consoleLink(
  http: Http,
  sessionId: string,
  opts: { mode?: "view" | "control"; ttlSec?: number } = {},
): Promise<ConsoleLink> {
  return http.post<ConsoleLink>(`/sessions/${enc(sessionId)}/console-link`, { mode: opts.mode, ttlSec: opts.ttlSec });
}

/** End every console link of the capsule and close the consoles opened with them. */
export async function revokeConsoleLinks(http: Http, sessionId: string): Promise<void> {
  await http.post(`/sessions/${enc(sessionId)}/console-links/revoke`, {});
}
