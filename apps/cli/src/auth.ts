// Interactive auth helpers — password and refresh grants against the BFF's
// /auth/token endpoint (the same one the dashboard uses). API-key auth needs none
// of this; this is only for `cap login --email`.

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
  const res = await fetch(tokenUrl(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "password", email, password }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Login failed (${res.status}): ${t || res.statusText}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = (data.access_token ?? data.accessToken) as string | undefined;
  const refreshToken = (data.refresh_token ?? data.refreshToken) as string | undefined;
  if (!accessToken) throw new Error("Login succeeded but no access_token was returned.");
  return { accessToken, refreshToken };
}

export async function refreshGrant(baseUrl: string, refreshToken: string): Promise<TokenSet> {
  const res = await fetch(tokenUrl(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${t || res.statusText}`);
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

/** Read a password from stdin without echoing (best-effort; falls back to visible). */
export async function promptPassword(prompt = "Password: "): Promise<string> {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const isTty = Boolean(stdin.isTTY);
    const wasRaw = isTty ? stdin.isRaw : false;
    if (isTty) stdin.setRawMode(true);
    stdin.resume();
    let buf = "";
    const finish = () => {
      if (isTty) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(buf);
    };
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
