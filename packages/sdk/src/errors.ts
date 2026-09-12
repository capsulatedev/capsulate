// Error types for the Capsulate SDK. A single CapsulateError carries the HTTP
// status and the parsed error body so callers can branch on it cleanly.

export class CapsulateError extends Error {
  /** HTTP status code, or 0 for network/transport failures. */
  readonly status: number;
  /** The parsed response body (object or string), when available. */
  readonly body: unknown;
  /** The request method + path that failed, for diagnostics. */
  readonly request: { method: string; path: string };

  constructor(
    message: string,
    opts: { status: number; body?: unknown; request: { method: string; path: string } },
  ) {
    super(message);
    this.name = "CapsulateError";
    this.status = opts.status;
    this.body = opts.body;
    this.request = opts.request;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isPaymentRequired(): boolean {
    return this.status === 402;
  }
}

/** Thrown when the SDK is used without credentials. */
export class CapsulateAuthError extends CapsulateError {
  constructor(message = "No Capsulate credentials provided. Set an apiKey or token.") {
    super(message, { status: 401, request: { method: "", path: "" } });
    this.name = "CapsulateAuthError";
  }
}
