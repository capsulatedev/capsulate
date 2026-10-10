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

  /** The machine code of the error body, when it has one (human_in_control, browser_error, not_found,
   *  unsupported). */
  get code(): string | undefined {
    const b = this.body as { error?: unknown } | undefined;
    return b && typeof b === "object" && typeof b.error === "string" ? b.error : undefined;
  }

  /**
   * Phase LCU: a person holds the capsule's shared screen, so an AI input was refused (409). Wait with
   * `waitForHandback()` and retry.
   */
  get isHumanInControl(): boolean {
    const b = this.body as { error?: unknown } | undefined;
    return this.status === 409 && !!b && typeof b === "object" && b.error === "human_in_control";
  }
}

/** Thrown when the SDK is used without credentials. */
export class CapsulateAuthError extends CapsulateError {
  constructor(message = "No Capsulate credentials provided. Set an apiKey or token.") {
    super(message, { status: 401, request: { method: "", path: "" } });
    this.name = "CapsulateAuthError";
  }
}
