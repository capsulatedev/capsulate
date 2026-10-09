// Auth helpers for `cap login` / `cap whoami`:
//   - verifyApiKey: check a key with GET /api/v1/teams and classify the failure
//     (rejected vs unreachable) so the CLI can refuse to store a bad key;
//   - startDeviceLogin / pollDeviceLogin: the browser ("device") sign-in flow against
//     the BFF's /auth/device endpoints;
//   - passwordGrant / refreshGrant: the email+password path via /auth/token.

import { Capsulate, CapsulateError } from "@capsulate/sdk";

/** The host part of the API base URL, for messages ("api.capsulate.dev"). */
export function apiHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export interface KeyCheckFailure {
  ok: false;
  /** rejected = 401/403 from the API; unreachable = no HTTP response; error = anything else. */
  kind: "rejected" | "unreachable" | "error";
  status: number;
  message: string;
}
export type KeyCheck =
  | { ok: true; teams: Array<{ id: string; name?: string }> }
  | KeyCheckFailure;

/**
 * Turn the SDK's raw network message ("Network error calling GET /teams: fetch failed
 * (ENOTFOUND)") into something a person can act on.
 */
export function networkReason(raw: string): string {
  const msg = raw.replace(/^Network error calling \S+ \S+: /, "").replace(/^fetch failed\s*/, "");
  const code = /\(?([A-Z][A-Z_0-9]{3,})\)?/.exec(msg)?.[1] ?? "";
  const known: Record<string, string> = {
    ENOTFOUND: "the host name did not resolve",
    EAI_AGAIN: "the host name could not be looked up right now",
    ECONNREFUSED: "the connection was refused",
    ECONNRESET: "the connection was closed early",
    ETIMEDOUT: "the connection timed out",
    UND_ERR_CONNECT_TIMEOUT: "the connection timed out",
    CERT_HAS_EXPIRED: "the TLS certificate has expired",
    DEPTH_ZERO_SELF_SIGNED_CERT: "the TLS certificate is self-signed",
  };
  if (known[code]) return `${known[code]} (${code})`;
  return msg.replace(/^[(\s]+|[)\s]+$/g, "") || "no response";
}

/** Turn a failed API call into a plain-language, classified failure. Never throws. */
export function classifyAuthFailure(err: unknown, host: string, what = "That API key"): KeyCheckFailure {
  if (err instanceof CapsulateError) {
    if (err.status === 401 || err.status === 403) {
      return {
        ok: false,
        kind: "rejected",
        status: err.status,
        message: `${what} was rejected by ${host} (${err.status}). Create one in the dashboard under API keys.`,
      };
    }
    if (err.status === 0) {
      return {
        ok: false,
        kind: "unreachable",
        status: 0,
        message: `Could not reach ${host}: ${networkReason(err.message)}. Check your network, or --base-url if you set one.`,
      };
    }
    return { ok: false, kind: "error", status: err.status, message: `${host} answered ${err.status}: ${err.message}` };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { ok: false, kind: "error", status: 0, message: msg };
}

/** Verify an API key by listing the caller's teams (GET /api/v1/teams). Never throws. */
export async function verifyApiKey(baseUrl: string, apiKey: string, userAgent?: string): Promise<KeyCheck> {
  try {
    const client = new Capsulate({ apiKey, baseUrl, userAgent });
    const teams = await client.teams.list();
    return { ok: true, teams: Array.isArray(teams) ? teams : [] };
  } catch (err) {
    return classifyAuthFailure(err, apiHost(baseUrl));
  }
}

// ---- browser (device) sign-in: POST /auth/device, then poll /auth/device/token ----

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export type DevicePoll =
  | { status: "pending" }
  | { status: "slow_down" }
  | { status: "expired" }
  | { status: "approved"; apiKey: string; teamId?: string; teamName?: string };

function deviceUrl(baseUrl: string, suffix = ""): string {
  return baseUrl.replace(/\/+$/, "") + "/api/v1/auth/device" + suffix;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    const detail = cause?.code || cause?.message || (err instanceof Error ? err.message : String(err));
    throw new Error(`Could not reach ${apiHost(url)}: ${networkReason(detail)}.`);
  }
}

/** Pull a readable message out of an error response body (JSON {error} or plain text). */
async function errText(res: Response): Promise<string> {
  try {
    const t = (await res.text()).trim();
    if (!t) return "";
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const m = j.error ?? j.message;
      if (typeof m === "string" && m) return m;
    } catch {
      /* not JSON */
    }
    return t.slice(0, 300);
  } catch {
    return "";
  }
}

export async function startDeviceLogin(
  baseUrl: string,
  meta: { hostname: string; client: string },
): Promise<DeviceStart> {
  const res = await postJson(deviceUrl(baseUrl), meta);
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Too many sign-in attempts from this address. Wait a minute and try again.");
    }
    throw new Error(`Browser sign-in could not start (${res.status}). ${await errText(res)}`.trim());
  }
  const d = (await res.json()) as Partial<DeviceStart>;
  if (!d.deviceCode || !d.userCode || !d.verificationUrl) {
    throw new Error("Browser sign-in could not start: the server sent an incomplete response.");
  }
  return {
    deviceCode: d.deviceCode,
    userCode: d.userCode,
    verificationUrl: d.verificationUrl,
    expiresIn: typeof d.expiresIn === "number" ? d.expiresIn : 600,
    interval: typeof d.interval === "number" ? d.interval : 3,
  };
}

export async function pollDeviceLogin(baseUrl: string, deviceCode: string): Promise<DevicePoll> {
  const res = await postJson(deviceUrl(baseUrl, "/token"), { deviceCode });
  if (res.status === 428) return { status: "pending" };
  if (res.status === 429) return { status: "slow_down" };
  if (res.status === 410 || res.status === 404) return { status: "expired" };
  if (!res.ok) {
    throw new Error(`Browser sign-in failed (${res.status}). ${await errText(res)}`.trim());
  }
  const d = (await res.json()) as { status?: string; apiKey?: string; teamId?: string; teamName?: string };
  if (d.status === "approved" && d.apiKey) {
    return { status: "approved", apiKey: d.apiKey, teamId: d.teamId, teamName: d.teamName };
  }
  if (d.status === "pending") return { status: "pending" };
  throw new Error("Browser sign-in failed: unexpected response from the server.");
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
}

function tokenUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "") + "/api/v1/auth/token";
}

export async function passwordGrant(
  baseUrl: string,
  email: string,
  password: string,
): Promise<TokenSet> {
  const res = await postJson(tokenUrl(baseUrl), { grant_type: "password", email, password });
  if (!res.ok) {
    const host = apiHost(baseUrl);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${host} did not accept that email and password (${res.status}).`);
    }
    throw new Error(`Login failed: ${host} answered ${res.status}. ${await errText(res)}`.trim());
  }
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = (data.access_token ?? data.accessToken) as string | undefined;
  const refreshToken = (data.refresh_token ?? data.refreshToken) as string | undefined;
  if (!accessToken) throw new Error("Login succeeded but no access_token was returned.");
  return { accessToken, refreshToken };
}

export async function refreshGrant(baseUrl: string, refreshToken: string): Promise<TokenSet> {
  const res = await postJson(tokenUrl(baseUrl), {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}). ${await errText(res)}`.trim());
  }
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = (data.access_token ?? data.accessToken) as string | undefined;
  const newRefresh = (data.refresh_token ?? data.refreshToken) as string | undefined;
  if (!accessToken) throw new Error("Refresh succeeded but no access_token was returned.");
  return { accessToken, refreshToken: newRefresh ?? refreshToken };
}

/** Seconds until the JWT expires (negative if already expired); null if unparseable. */
export function jwtSecondsLeft(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    const payload = JSON.parse(json) as { exp?: number };
    if (!payload.exp) return null;
    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return null;
  }
}

const CTRL_C = "";
const BACKSPACE_DEL = "";
const BACKSPACE = "";

/**
 * Read a secret (password / API key) from stdin without echoing. On a TTY the terminal
 * is put in raw mode so nothing is printed back; on a pipe the first line is read as-is.
 * A closed stdin (no terminal, nothing piped) resolves with whatever was read so far.
 */
export async function promptPassword(prompt = "Password: "): Promise<string> {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const isTty = Boolean(stdin.isTTY);
    const wasRaw = isTty ? stdin.isRaw : false;
    if (isTty) stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (isTty) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdin.removeListener("end", finish);
      process.stdout.write("\n");
      resolve(buf);
    };
    stdin.once("end", finish);
    const onData = (chunk: Buffer) => {
      const s = chunk.toString("utf-8");
      for (const ch of s) {
        if (ch === "\n" || ch === "\r") {
          finish();
          return;
        } else if (ch === CTRL_C) {
          if (isTty) stdin.setRawMode(wasRaw);
          process.exit(130);
        } else if (ch === BACKSPACE_DEL || ch === BACKSPACE) {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}
