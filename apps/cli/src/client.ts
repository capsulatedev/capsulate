// Resolve credentials (flags > env > config file) into a ready-to-use Capsulate
// client. For interactive (token) auth, the access token is refreshed up-front if
// it's near expiry and the refreshed token is persisted back to the config.

import { Capsulate } from "@capsulate/sdk";
import { loadConfig, saveConfig, DEFAULT_BASE_URL, type CliConfig } from "./config.js";
import { refreshGrant, jwtSecondsLeft } from "./auth.js";

export interface GlobalOpts {
  apiKey?: string;
  token?: string;
  baseUrl?: string;
  team?: string;
  json?: boolean;
}

const VERSION = "0.4.0";

export interface Resolved {
  client: Capsulate;
  baseUrl: string;
  teamId?: string;
}

export async function resolveClient(opts: GlobalOpts): Promise<Resolved> {
  const cfg: CliConfig = loadConfig();
  const baseUrl = opts.baseUrl || process.env.CAPSULATE_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL;
  const teamId = opts.team || process.env.CAPSULATE_TEAM_ID || cfg.teamId;

  // API key takes precedence (the agent/CI credential).
  const apiKey = opts.apiKey || process.env.CAPSULATE_API_KEY || cfg.apiKey;
  let token = opts.token || process.env.CAPSULATE_TOKEN || cfg.token;

  if (!apiKey && token && cfg.token === token && cfg.refreshToken) {
    // Interactive token from the config — refresh it if it's close to expiry.
    const left = jwtSecondsLeft(token);
    if (left !== null && left < 30) {
      try {
        const fresh = await refreshGrant(baseUrl, cfg.refreshToken);
        token = fresh.accessToken;
        saveConfig({ ...cfg, token: fresh.accessToken, refreshToken: fresh.refreshToken });
      } catch {
        // Fall through with the (possibly expired) token; the request will 401.
      }
    }
  }

  if (!apiKey && !token) {
    throw new Error(
      "Not authenticated. Run `cap login` (paste an API key) or `cap login --email you@example.com`.",
    );
  }

  const client = new Capsulate({
    apiKey,
    token,
    baseUrl,
    teamId,
    userAgent: `cap-cli/${VERSION}`,
  });
  return { client, baseUrl, teamId };
}

export function cliVersion(): string {
  return VERSION;
}
