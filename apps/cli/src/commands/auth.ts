import type { Command } from "commander";
import { hostname } from "node:os";
import { loadConfig, saveConfig, clearConfig, configPath, DEFAULT_BASE_URL, type CliConfig } from "../config.js";
import {
  passwordGrant,
  promptPassword,
  verifyApiKey,
  classifyAuthFailure,
  apiHost,
  startDeviceLogin,
  pollDeviceLogin,
  type KeyCheckFailure,
} from "../auth.js";
import { cliVersion } from "../client.js";
import { openUrl } from "../browser.js";
import { gopts } from "./_shared.js";
import { setJsonMode, isJsonMode, out, success, info, fail, exitWith } from "../output.js";

const USAGE = [
  "Usage:",
  "  cap login                                # paste an API key, or press Enter for browser sign-in",
  "  cap login --api-key cap_live_...         # non-interactive (agents / CI)",
  "  cap login --web                          # sign in with your browser",
  "  cap login --email you@example.com        # email + password (team/billing admin)",
];

/** Print a classified sign-in failure and exit 1 (JSON: {error,status,kind}). */
function failCheck(check: KeyCheckFailure): never {
  if (isJsonMode()) {
    out({ error: check.message, status: check.status, kind: check.kind });
    return exitWith(1);
  }
  return fail(new Error(check.message));
}

/** Verify a key against the API; store it ONLY if the API accepts it. */
async function keyLogin(baseUrl: string, cfg: CliConfig, key: string, teamName?: string): Promise<void> {
  const check = await verifyApiKey(baseUrl, key, `cap-cli/${cliVersion()}`);
  if (!check.ok) failCheck(check);
  saveConfig({ ...cfg, apiKey: key, baseUrl, token: undefined, refreshToken: undefined });
  const teams = check.teams.map((t) => t.name ?? t.id);
  const shown = teamName ?? teams.join(", ");
  if (isJsonMode()) {
    out({ ok: true, auth: "api-key", baseUrl, teams: check.teams, configPath: configPath() });
    return;
  }
  success(`Signed in to ${apiHost(baseUrl)}. API key stored in ${configPath()}`);
  if (shown) info(`  Team: ${shown}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Browser (device) sign-in: print a link + code, open the browser, poll until approved. */
async function webLogin(baseUrl: string, cfg: CliConfig): Promise<void> {
  const start = await startDeviceLogin(baseUrl, { hostname: hostname(), client: `cli/${cliVersion()}` });
  // Written straight to stderr so the link is visible even with --json.
  process.stderr.write(`Open this link in your browser and approve the sign-in:\n\n  ${start.verificationUrl}\n\n`);
  process.stderr.write(`Your code: ${start.userCode}\n\n`);
  if (openUrl(start.verificationUrl)) process.stderr.write("(trying to open your default browser)\n");
  process.stderr.write("Waiting for approval...\n");

  const deadline = Date.now() + start.expiresIn * 1000;
  let intervalMs = Math.max(1, start.interval) * 1000;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const p = await pollDeviceLogin(baseUrl, start.deviceCode);
    if (p.status === "approved") {
      await keyLogin(baseUrl, cfg, p.apiKey, p.teamName);
      return;
    }
    if (p.status === "expired") {
      throw new Error("The sign-in code expired before it was approved. Run `cap login --web` again.");
    }
    if (p.status === "slow_down") intervalMs += 2000;
  }
  throw new Error("Timed out waiting for the browser approval. Run `cap login --web` again.");
}

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("Sign in: paste an API key, use your browser, or use email + password")
    .option("--api-key <key>", "Store an API key (recommended for agents/CI)")
    .option("--web", "Sign in with your browser (creates an API key for this machine)")
    .option("--email <email>", "Log in interactively as a user (for team/billing admin)")
    .option("--base-url <url>", "API base URL")
    .action(async (_opts, command: Command) => {
      const g = gopts(command);
      setJsonMode(Boolean(g.json));
      const local = command.opts<{ apiKey?: string; web?: boolean; email?: string; baseUrl?: string }>();
      const baseUrl = local.baseUrl || g.baseUrl || DEFAULT_BASE_URL;
      const cfg = loadConfig();
      try {
        if (local.email) {
          const password = await promptPassword(`Password for ${local.email}: `);
          const tokens = await passwordGrant(baseUrl, local.email, password);
          saveConfig({
            ...cfg,
            email: local.email,
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            baseUrl,
            apiKey: undefined,
          });
          success(`Logged in as ${local.email}. Token stored in ${configPath()}`);
          return;
        }
        if (local.web) {
          await webLogin(baseUrl, cfg);
          return;
        }
        let key = (local.apiKey || g.apiKey || "").trim();
        if (!key) {
          key = (
            await promptPassword(
              "Paste an API key (starts with the prefix your dashboard shows), or press Enter to sign in with your browser: ",
            )
          ).trim();
          if (!key) {
            if (!process.stdin.isTTY) {
              // Nothing pasted and no terminal to open a browser from (CI, a script).
              for (const l of USAGE) info(l);
              return exitWith(2);
            }
            await webLogin(baseUrl, cfg);
            return;
          }
        }
        await keyLogin(baseUrl, cfg, key);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("configure")
    .description("Set CLI defaults (base URL, team) without changing credentials")
    .option("--base-url <url>", "Default API base URL")
    .option("--team <id>", "Default team id")
    .action((_opts, command: Command) => {
      const local = command.opts<{ baseUrl?: string; team?: string }>();
      const cfg = loadConfig();
      if (local.baseUrl) cfg.baseUrl = local.baseUrl;
      if (local.team) cfg.teamId = local.team;
      saveConfig(cfg);
      success(`Saved defaults to ${configPath()}`);
    });

  program
    .command("whoami")
    .description("Show the current credential, base URL, and teams (exit 1 when not signed in)")
    .action(async (_opts, command: Command) => {
      const g = gopts(command);
      setJsonMode(Boolean(g.json));
      const cfg = loadConfig();
      const baseUrl = g.baseUrl || process.env.CAPSULATE_BASE_URL || cfg.baseUrl || DEFAULT_BASE_URL;
      const host = apiHost(baseUrl);
      const apiKey = g.apiKey || process.env.CAPSULATE_API_KEY || cfg.apiKey;
      const token = g.token || process.env.CAPSULATE_TOKEN || cfg.token;
      const authKind = apiKey ? "api-key" : token ? "token" : "none";

      const notOk = (kind: string, status: number, message: string): never => {
        if (isJsonMode()) {
          out({ auth: authKind, baseUrl, email: cfg.email, signedIn: false, kind, status, error: message });
        } else {
          process.stderr.write(message + "\n");
        }
        return exitWith(1);
      };

      if (authKind === "none") {
        notOk("not-signed-in", 0, "Not signed in. Run `cap login` to paste an API key or sign in with your browser.");
      }
      try {
        const { resolveClient } = await import("../client.js");
        const { client } = await resolveClient(g);
        const teams = await client.teams.list();
        const d = { auth: authKind, baseUrl, email: cfg.email, signedIn: true, teams };
        if (isJsonMode()) {
          out(d);
          return;
        }
        process.stdout.write(
          `Auth:     ${d.auth}\n` +
            `Base URL: ${d.baseUrl}\n` +
            (d.email ? `Email:    ${d.email}\n` : "") +
            `Teams:    ${(teams as any[]).map((t) => `${t.name ?? t.id} (${t.id})`).join(", ") || "(none)"}\n`,
        );
      } catch (err) {
        const c = classifyAuthFailure(err, host, authKind === "api-key" ? "Your stored API key" : "Your stored token");
        if (c.kind === "rejected") {
          notOk(
            "rejected",
            c.status,
            `Your stored ${authKind === "api-key" ? "API key" : "token"} was rejected by ${host} (${c.status}). Run \`cap login\` to sign in again.`,
          );
        }
        if (c.kind === "unreachable") notOk("unreachable", 0, c.message);
        notOk("error", c.status, c.message);
      }
    });

  program
    .command("logout")
    .description("Remove stored credentials")
    .action(() => {
      clearConfig();
      success("Logged out (credentials cleared).");
    });
}
