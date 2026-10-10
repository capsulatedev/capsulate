// The browser fast path (LCU M2): drive the agent's own Chrome inside a desktop capsule over the Chrome DevTools
// Protocol, at page speed, while a person watches the same screen. Read the page as an outline with refs, then act
// by ref: `await b.click({ ref: "e5" })`. Every call is POST /api/v1/sessions/{id}/browser/{verb}.

import type { Http } from "./http.js";

const enc = encodeURIComponent;

/** Which element: a ref from snapshot() (best), a CSS selector, or visible text / accessible name. */
export interface BrowserTarget {
  ref?: string;
  selector?: string;
  text?: string;
}

/** One element of a page outline. */
export interface BrowserElement {
  ref: string;
  role: string;
  name: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  level?: number;
  href?: string;
  inView?: boolean;
}

export interface BrowserPage {
  tab?: string;
  url: string;
  title: string;
}

export interface BrowserSnapshot extends BrowserPage {
  items: BrowserElement[];
  truncated: boolean;
}

export interface BrowserTab {
  tab: string;
  url: string;
  title: string;
}

/** The raw envelope of every browser call. */
export interface BrowserResult<T = Record<string, unknown>> {
  ok: boolean;
  result: T;
  driverMs?: number;
}

/** Run one browser verb and return its result (the SDK throws CapsulateError on 422 browser_error). */
export async function browserCall<T = Record<string, unknown>>(
  http: Http,
  sessionId: string,
  verb: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const r = await http.post<BrowserResult<T>>(`/sessions/${enc(sessionId)}/browser/${enc(verb)}`, body);
  return r.result;
}

/** The browser of one capsule. Get it with `capsule.browser` or `cap.capsules.browser(sessionId)`. */
export class Browser {
  constructor(
    private readonly http: Http,
    readonly sessionId: string,
  ) {}

  /** Run any browser verb with its own fields (the typed methods below are shorthands). */
  run<T = Record<string, unknown>>(verb: string, body: Record<string, unknown> = {}): Promise<T> {
    return browserCall<T>(this.http, this.sessionId, verb, body);
  }

  private call<T>(verb: string, body: Record<string, unknown> = {}): Promise<T> {
    return this.run<T>(verb, body);
  }

  /** Start the agent's Chrome if needed; with a url, load it and wait for it. */
  open(url?: string, opts: { timeoutMs?: number } = {}): Promise<BrowserPage & { started: boolean; loaded?: boolean }> {
    return this.call("open", { ...(url ? { url } : {}), ...opts });
  }
  /** Load a url in the current tab (or `tab`) and wait for it. */
  navigate(url: string, opts: { tab?: string; timeoutMs?: number } = {}): Promise<BrowserPage & { loaded: boolean }> {
    return this.call("navigate", { url, ...opts });
  }
  /** List tabs, or open, select or close one. */
  tabs(opts: { action?: "list" | "new" | "select" | "close"; tab?: string; url?: string } = {}): Promise<{ tabs?: BrowserTab[] } & Partial<BrowserTab>> {
    return this.call("tabs", opts);
  }
  /** The page as an outline of elements with refs. `interactive` keeps only what can be clicked or typed into. */
  snapshot(opts: { interactive?: boolean; max?: number; tab?: string } = {}): Promise<BrowserSnapshot> {
    return this.call("snapshot", opts);
  }
  /** Click an element (real mouse events at its centre). Returns the element and the page after the click. */
  click(target: BrowserTarget, opts: { clicks?: number; button?: "left" | "right" | "middle"; settleMs?: number; tab?: string } = {}): Promise<{ clicked: BrowserElement } & Partial<BrowserPage>> {
    return this.call("click", { ...target, ...opts });
  }
  /** Type a value into a field, replacing what is there; `submit` presses Enter after. The value is never echoed. */
  fill(target: BrowserTarget, value: string, opts: { submit?: boolean; settleMs?: number; tab?: string } = {}): Promise<{ filled: BrowserElement; chars: number; submitted: boolean }> {
    return this.call("fill", { ...target, value, ...opts });
  }
  /** Choose an option of a <select> by value or label. */
  select(target: BrowserTarget, option: string, opts: { tab?: string } = {}): Promise<{ selected: string; value: string; element: BrowserElement }> {
    return this.call("select", { ...target, option, ...opts });
  }
  /** Press keys: "Enter", "Tab", "Escape", "ArrowDown", a single character... */
  press(...keys: string[]): Promise<{ pressed: string[] }> {
    return this.call("press", { keys });
  }
  /** Scroll by dy pixels, or bring an element into view. */
  scroll(opts: { dy?: number } & BrowserTarget = {}): Promise<Record<string, unknown>> {
    return this.call("scroll", opts as Record<string, unknown>);
  }
  /** Wait until an element (or text) appears, or with state "hidden" goes away. Without a target: page loaded. */
  wait(target: BrowserTarget = {}, opts: { state?: "visible" | "hidden"; timeoutMs?: number; tab?: string } = {}): Promise<{ found: boolean; element?: BrowserElement; waitedMs: number; timedOut?: boolean }> {
    return this.call("wait", { ...target, ...opts });
  }
  /** The page's text, or one element's. */
  text(target: BrowserTarget = {}, opts: { max?: number; tab?: string } = {}): Promise<{ text: string } & Partial<BrowserPage>> {
    return this.call("text", { ...target, ...opts });
  }
  /** Evaluate a JavaScript expression in the page and return its JSON value. */
  eval<T = unknown>(expression: string, opts: { timeoutMs?: number; tab?: string } = {}): Promise<{ value: T }> {
    return this.call("eval", { expression, ...opts });
  }
  /** A screenshot of the page: JPEG (default, quality 70) or PNG, base64. */
  screenshot(opts: { format?: "jpeg" | "png"; quality?: number; fullPage?: boolean; tab?: string } = {}): Promise<{ format: string; base64: string }> {
    return this.call("screenshot", opts);
  }
}
