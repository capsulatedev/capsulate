// 12R-14: nudge the user when their `cap` is outdated. Best-effort + throttled (one network
// check per 24h, cached in config), so it never slows a command or affects its exit code.
// Skipped in --json mode (scripting/agents) or when CAPSULATE_NO_UPDATE_CHECK is set.

import { loadConfig, saveConfig } from "./config.js";
import { cliVersion } from "./client.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Tiny semver compare: -1 | 0 | 1. Tolerant of v-prefix / partials / pre-release / junk.
function cmp(a: string, b: string): number {
  const parse = (v: string) =>
    (v || "").trim().replace(/^v/i, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

async function fetchMeta(baseUrl: string): Promise<{ minClient?: string; latestClient?: string } | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const r = await fetch(baseUrl.replace(/\/$/, "") + "/api/v1/meta/versions", { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as { minClient?: string; latestClient?: string };
  } catch {
    return null;
  }
}

export async function maybeNotifyUpdate(baseUrl: string, json: boolean): Promise<void> {
  if (json || process.env.CAPSULATE_NO_UPDATE_CHECK) return;
  try {
    const cfg = loadConfig();
    let min = cfg.cachedMinClient;
    let latest = cfg.cachedLatestClient;
    if (Date.now() - (cfg.lastUpdateCheck || 0) > DAY_MS) {
      const meta = await fetchMeta(baseUrl);
      if (meta) {
        min = meta.minClient || min;
        latest = meta.latestClient || latest;
        // Re-load so we don't clobber a token refresh the command may have just persisted.
        const fresh = loadConfig();
        saveConfig({ ...fresh, lastUpdateCheck: Date.now(), cachedMinClient: min, cachedLatestClient: latest });
      }
    }
    const v = cliVersion();
    if (min && cmp(v, min) < 0) {
      process.stderr.write(
        `\n⚠ cap ${v} is below the supported minimum (${min}). Update: npm i -g @capsulate/cli@latest\n`,
      );
    } else if (latest && cmp(v, latest) < 0) {
      process.stderr.write(
        `\nA newer cap is available (${latest}; you have ${v}). Update: npm i -g @capsulate/cli@latest\n`,
      );
    }
  } catch {
    /* the notifier must never affect the command */
  }
}
