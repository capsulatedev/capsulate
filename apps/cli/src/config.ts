// Persistent CLI config at ~/.capsulate/config.json. Stores the credential
// (API key OR an interactive token + refresh token) and defaults (base URL, team).

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";

export interface CliConfig {
  apiKey?: string;
  token?: string;
  refreshToken?: string;
  email?: string;
  baseUrl?: string;
  teamId?: string;
  // 12R-14: throttle the update check to once/day + cache the policy so the nudge is instant.
  lastUpdateCheck?: number; // epoch ms
  cachedMinClient?: string;
  cachedLatestClient?: string;
}

export const DEFAULT_BASE_URL = "https://api.capsulate.dev";

function configDir(): string {
  return process.env.CAPSULATE_CONFIG_DIR || join(homedir(), ".capsulate");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): CliConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: CliConfig): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  const p = configPath();
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
  // Best-effort: tighten perms since the file holds credentials (no-op on Windows).
  try {
    chmodSync(p, 0o600);
  } catch {
    /* ignore */
  }
}

export function clearConfig(): void {
  saveConfig({});
}
