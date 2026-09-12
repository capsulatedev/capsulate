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
  UITreeResult,
  ElementSelector,
  FindElementResult,
  WaitElementResult,
  ClipboardResult,
  WindowListResult,
  OCRResult,
  TraceResult,
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

/** Run a snippet of code in the capsule. Convenience over exec for common languages. */
export async function run(
  http: Http,
  sessionId: string,
  code: string,
  opts: { lang?: "python" | "node" | "bash" | "sh"; timeoutSec?: number; cwd?: string } = {},
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

export async function screenshot(http: Http, sessionId: string): Promise<ScreenshotResult> {
  return http.post<ScreenshotResult>(`/sessions/${enc(sessionId)}/screenshot`, { sessionId });
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

export async function typeText(
  http: Http,
  sessionId: string,
  text: string,
  opts: ScreenshotAfterOptions = {},
): Promise<InputResult> {
  return http.post<InputResult>(`/sessions/${enc(sessionId)}/type`, { sessionId, text, ...shotFields(opts) });
}

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

/** The live structured action trace (Phase CU.5) — every interaction this run, in order. */
export async function getTrace(http: Http, sessionId: string): Promise<TraceResult> {
  return http.get<TraceResult>(`/sessions/${enc(sessionId)}/trace`);
}
