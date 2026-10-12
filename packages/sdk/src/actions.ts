// Several computer-use steps in one call (LCU M2.4): POST /api/v1/sessions/{id}/actions.
//
// Decide once, act many times: the steps run one after another on the server at machine speed, each exactly as
// its own endpoint would run it (the same checks, the same live console line), and the run stops at the first
// step that fails. `expect` makes a step wait for what should follow it; `observe` returns a look at the end.
//
//   await capsule.runActions([
//     { do: "click_element", selector: { name: "Save" } },
//     { do: "type", text: "notes.txt" },
//     { do: "key", keys: ["enter"], expect: { selector: { name: "Saved" }, timeoutMs: 3000 } },
//   ], { observe: "screenshot" });
//
// Commands and files mix in (Phase HYB): write the file through the API, then show it on the screen.
//
//   await capsule.runActions([
//     { do: "write_file", path: "/home/capsulate/notes.txt", content: "1. Follow up\n" },
//     { do: "open", target: "/home/capsulate/notes.txt", waitMs: 10000 },
//   ], { observe: "screenshot" });

import type { Http } from "./http.js";

const enc = encodeURIComponent;

/**
 * One step. `do` names the verb and the other fields are that verb's own body:
 * - the computer-use verbs by endpoint: screenshot, click, type, key, move, scroll, drag, ui_tree, find_element,
 *   wait_element, clipboard (read), clipboard_set, windows (list), window_focus, ocr;
 * - the complete toolset (LCU M2.6): element ({action, selector, value?}: set_value, toggle, expand, invoke,
 *   select, ...), window ({action, title | id}: minimize, maximize, move, ...), open ({target, waitMs?}),
 *   wait_for ({condition, ...}; a wait that ends unmet fails the step) and screen;
 * - the browser fast path as browser_<verb>: browser_open, browser_navigate, browser_snapshot, browser_click,
 *   browser_fill, browser_select, browser_press, browser_scroll, browser_wait, browser_text, browser_eval,
 *   browser_screenshot, browser_tabs;
 * - commands and files (Phase HYB): exec (the exec body: {cmd, cwd?, env?, timeoutSec?}; its timeout is cut to
 *   what is left of the run), write_file ({path, content} for text or {path, contentB64}) and read_file
 *   ({path, maxBytes?}; a text file also comes back as `text`). They are not screen input, so they run while a
 *   person holds the screen;
 * - run helpers: click_element ({selector, waitMs?, button?, count?}: find, waiting up to 5 s, then click the
 *   centre), say ({text}: one line of narration for the person watching) and pause ({ms}, at most 10000);
 * - skills (Phase SK): use ({procedure, skill?, version?, args?}: run a procedure of a skill with its args; the
 *   run's `skill` is the default), check (one of {element, present?}, {window}, {exec, exitCode?, contains?},
 *   {file, contains?} or {pixel: {x, y, color, tolerance?}}, waiting up to timeoutMs), pixel ({x, y}: a pixel's
 *   colour) and menus ({window?}: every menu's items, read by opening each menu).
 *
 * Any field can hold {{name}} placeholders, filled from the values earlier steps saved (`save`); a placeholder that
 * is the whole value keeps its type (a number in a text field is used as its text), and an unknown one stays as
 * typed.
 */
export interface RunStep {
  do: string;
  /** The step's coordinates are in this frame's units (the run's `frames`), mapped to the screen; a stroke is
   *  clamped inside the frame's `clamp`. */
  frame?: string;
  /** Keep fields of the step's result as variables for later steps: {"total": "text"} keeps result.text as
   *  {{total}}, "" the whole result. */
  save?: Record<string, string>;
  /** A wait that must succeed after the step: wait_element fields after a desktop step ({selector, timeoutMs}),
   *  browser_wait fields after a browser step ({text | selector | ref, state, timeoutMs}). */
  expect?: Record<string, unknown>;
  /** The step may fail without stopping the run (for example closing a popup that may not be there). */
  optional?: boolean;
  [field: string]: unknown;
}

/** What the run returns when it ends (also when it stopped early): nothing, the screen, the UI tree, or the
 *  browser page outline. */
export type RunObserve = "none" | "screenshot" | "ui_tree" | "browser_snapshot";

export interface RunStepResult<T = unknown> {
  /** The step's index in the run. */
  i: number;
  do: string;
  ok: boolean;
  /** Exactly what the step's own endpoint answers. */
  result?: T;
  /** For a failed step: the HTTP status its endpoint gave, a machine code (human_in_control, browser_error) and
   *  the message. */
  status?: number;
  code?: string;
  error?: string;
  expect?: RunStepResult;
  ms: number;
}

export type RunStopReason = "step_failed" | "expectation_not_met" | "human_in_control" | "time_budget" | "cancelled";

export interface RunActionsResult {
  /** Every step that is not optional succeeded. */
  ok: boolean;
  completed: number;
  total: number;
  /** The index of the step the run stopped at, and why. On human_in_control, wait for the person to hand the
   *  screen back (capsule.waitForHandback()), then run the rest. */
  stoppedAt?: number;
  stopReason?: RunStopReason;
  steps: RunStepResult[];
  observation?: RunStepResult;
  /** The values the steps saved (`save`) by the end of the run. */
  variables?: Record<string, unknown>;
  ms: number;
}

/** A coordinate frame: screen = origin + scale * (x, y); clamp ([[x0, y0], [x1, y1]] in frame units) keeps every
 *  point of a stroke inside. */
export interface RunFrame {
  origin: [number, number];
  scale: number;
  clamp?: [[number, number], [number, number]];
}

export interface RunActionsOptions {
  observe?: RunObserve;
  /** The skill `use` steps call when they name none (its current version). */
  skill?: string;
  /** Frames the steps may name. */
  frames?: Record<string, RunFrame>;
}

/** Run steps in one call. A run is checked whole before any step runs: at most 200 steps, 90 s in all. */
export function runActions(
  http: Http,
  sessionId: string,
  steps: RunStep[],
  opts: RunActionsOptions = {},
): Promise<RunActionsResult> {
  return http.post<RunActionsResult>(`/sessions/${enc(sessionId)}/actions`, {
    steps,
    ...(opts.observe ? { observe: opts.observe } : {}),
    ...(opts.skill ? { skill: opts.skill } : {}),
    ...(opts.frames ? { frames: opts.frames } : {}),
  });
}
