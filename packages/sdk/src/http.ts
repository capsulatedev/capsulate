// The transport layer: a tiny fetch wrapper that attaches Capsulate auth, parses
// JSON, and turns non-2xx responses into CapsulateError. Uses the global `fetch`
// (Node 18+ and all browsers) so the SDK has zero runtime dependencies.

import { CapsulateError, CapsulateAuthError } from "./errors.js";

export interface HttpConfig {
  /** Base origin, e.g. "https://api.capsulate.dev". The "/api/v1" prefix is added automatically. */
  baseUrl: string;
  /** A cap_live_ API key (agent / CI / MCP auth). */
  apiKey?: string;
  /** A Keycloak access token (interactive auth — equivalent to a dashboard login). */
  token?: string;
  /** Per-request timeout in ms (default 120s). */
  timeoutMs?: number;
  /** Optional fetch override (testing). */
  fetch?: typeof fetch;
  /** Optional extra headers on every request. */
  headers?: Record<string, string>;
  /** Optional User-Agent suffix (e.g. "cap-cli/0.1.0"). */
  userAgent?: string;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Override the default Accept / parsing for binary responses. */
  raw?: boolean;
  signal?: AbortSignal;
  /** Extra headers for this request (e.g. an Idempotency-Key). */
  headers?: Record<string, string>;
}

export class Http {
  private readonly cfg: HttpConfig;
  private readonly base: string;
  private readonly doFetch: typeof fetch;

  constructor(cfg: HttpConfig) {
    if (!cfg.apiKey && !cfg.token) {
      throw new CapsulateAuthError();
    }
    this.cfg = cfg;
    this.base = cfg.baseUrl.replace(/\/+$/, "") + "/api/v1";
    const f = cfg.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "No global fetch available. Use Node 18+ or pass a fetch implementation to the Capsulate client.",
      );
    }
    this.doFetch = f.bind(globalThis);
  }

  private authHeader(): Record<string, string> {
    if (this.cfg.apiKey) return { Authorization: `Bearer ${this.cfg.apiKey}` };
    if (this.cfg.token) return { Authorization: `Bearer ${this.cfg.token}` };
    return {};
  }

  private url(path: string, query?: RequestOptions["query"]): string {
    const u = new URL(this.base + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = this.url(path, opts.query);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.authHeader(),
      ...(this.cfg.headers ?? {}),
      ...(opts.headers ?? {}),
    };
    if (this.cfg.userAgent) headers["User-Agent"] = this.cfg.userAgent;

    let bodyInit: BodyInit | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyInit = JSON.stringify(opts.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 120_000);
    const signal = opts.signal ?? controller.signal;

    let res: Response;
    try {
      res = await this.doFetch(url, { method, headers, body: bodyInit, signal });
    } catch (err: unknown) {
      clearTimeout(timeout);
      let msg = err instanceof Error ? err.message : String(err);
      // Node's fetch reports "fetch failed" and hides the reason (ENOTFOUND, ECONNREFUSED,
      // a TLS error) on err.cause; surface it so users can see why.
      const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
      const detail = cause?.code || cause?.message;
      if (detail && !msg.includes(detail)) msg += ` (${detail})`;
      throw new CapsulateError(`Network error calling ${method} ${path}: ${msg}`, {
        status: 0,
        request: { method, path },
      });
    }
    clearTimeout(timeout);

    if (opts.raw) {
      if (!res.ok) throw await this.toError(res, method, path);
      return res as unknown as T;
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new CapsulateError(this.errMessage(res.status, parsed), {
        status: res.status,
        body: parsed,
        request: { method, path },
      });
    }
    return parsed as T;
  }

  private async toError(res: Response, method: string, path: string): Promise<CapsulateError> {
    let body: unknown;
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    return new CapsulateError(this.errMessage(res.status, body), {
      status: res.status,
      body,
      request: { method, path },
    });
  }

  private errMessage(status: number, body: unknown): string {
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      const code = typeof b.error === "string" ? b.error : "";
      const msg = typeof b.message === "string" ? b.message : "";
      // A machine code with a human message ({"error":"browser_error","message":"no element named ..."}):
      // the message says what happened; the code stays on CapsulateError.body.
      if (msg && (!code || /^[a-z0-9_]+$/.test(code))) return msg;
      if (code) return code;
    }
    if (typeof body === "string" && body.trim()) return body.trim();
    return `Request failed with status ${status}`;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, { ...opts, body });
  }
  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, opts);
  }
}
