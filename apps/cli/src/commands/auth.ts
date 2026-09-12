import type { Command } from "commander";
import { Capsulate } from "@capsulate/sdk";
import { loadConfig, saveConfig, clearConfig, configPath, DEFAULT_BASE_URL } from "../config.js";
import { passwordGrant, promptPassword } from "../auth.js";
import { gopts } from "./_shared.js";
import { setJsonMode, out, success, info, fail, result } from "../output.js";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("Authenticate the CLI — paste an API key, or log in with email/password")
    .option("--api-key <key>", "Store a cap_live_ API key (recommended for agents/CI)")
    .option("--email <email>", "Log in interactively as a user (for team/billing admin)")
    .option("--base-url <url>", "API base URL")
    .action(async (_opts, command: Command) => {
      const g = gopts(command);
      setJsonMode(Boolean(g.json));
      const local = command.opts<{ apiKey?: string; email?: string; baseUrl?: string }>();
      const baseUrl = local.baseUrl || g.baseUrl || DEFAULT_BASE_URL;
      const cfg = loadConfig();
      try {
        if (local.apiKey || (!local.email && g.apiKey)) {
          const key = local.apiKey || g.apiKey!;
          // Verify by listing teams.
          const client = new Capsulate({ apiKey: key, baseUrl });
          await client.teams.list().catch(() => undefined);
          saveConfig({ ...cfg, apiKey: key, baseUrl, token: undefined, refreshToken: undefined });
          success(`API key stored in ${configPath()}`);
          return;
        }
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
        info("Usage:");
        info("  cap login --api-key cap_live_...         # recommended");
        info("  cap login --email you@example.com        # interactive");
        process.exit(2);
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
    .description("Show the current credential, base URL, and teams")
    .action(async (_opts, command: Command) => {
      const g = gopts(command);
      setJsonMode(Boolean(g.json));
      const cfg = loadConfig();
      const baseUrl = g.baseUrl || cfg.baseUrl || DEFAULT_BASE_URL;
      const authKind = cfg.apiKey || g.apiKey ? "api-key" : cfg.token || g.token ? "token" : "none";
      try {
        const { resolveClient } = await import("../client.js");
        const { client } = await resolveClient(g);
        const teams = await client.teams.list();
        result(
          { auth: authKind, baseUrl, email: cfg.email, teams },
          (d) =>
            `Auth:     ${d.auth}\n` +
            `Base URL: ${d.baseUrl}\n` +
            (d.email ? `Email:    ${d.email}\n` : "") +
            `Teams:    ${(d.teams as any[]).map((t) => `${t.name ?? t.id} (${t.id})`).join(", ") || "(none)"}`,
        );
      } catch {
        out({ auth: authKind, baseUrl, email: cfg.email, note: "not authenticated or unreachable" });
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
