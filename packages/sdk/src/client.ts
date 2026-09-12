// The Capsulate client — the single entry point that wires the transport, the team
// resolver, and every resource together.
//
//   import { Capsulate } from "@capsulate/sdk";
//   const cap = new Capsulate({ apiKey: process.env.CAPSULATE_API_KEY });
//   const c = await cap.capsules.launch({ template: "ubuntu-22.04-headless", size: "2c4g" });

import { Http, type HttpConfig } from "./http.js";
import type { ClientContext } from "./internal.js";
import { CapsulateError } from "./errors.js";
import { Capsules } from "./resources/capsules.js";
import { Volumes } from "./resources/volumes.js";
import { Sharing, Ports } from "./resources/sharing.js";
import { Catalog, Bundles, Templates } from "./resources/catalog.js";
import { Teams, Billing, ApiKeys } from "./resources/account.js";
import { Demos } from "./resources/demos.js";
import { TeamRecordings } from "./resources/recordings.js";
import type { TeamSummary } from "./types.js";

export interface CapsulateOptions {
  /** A cap_live_ API key (agent / CI / MCP). Falls back to env CAPSULATE_API_KEY. */
  apiKey?: string;
  /** A Keycloak access token for interactive auth (equivalent to a dashboard login). */
  token?: string;
  /** API origin. Falls back to env CAPSULATE_BASE_URL, then https://api.capsulate.dev. */
  baseUrl?: string;
  /** Default team id for team-scoped calls. Falls back to env CAPSULATE_TEAM_ID, then auto-resolves. */
  teamId?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Optional fetch override (testing / custom transports). */
  fetch?: typeof fetch;
  /** Extra headers to send on every request. */
  headers?: Record<string, string>;
  /** Appended to the User-Agent (e.g. "cap-cli/0.1.0"). */
  userAgent?: string;
}

const DEFAULT_BASE_URL = "https://api.capsulate.dev";

function envGet(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env) return process.env[name];
  return undefined;
}

export class Capsulate {
  readonly http: Http;
  private configuredTeamId?: string;
  private cachedTeamId?: string;

  readonly capsules: Capsules;
  readonly volumes: Volumes;
  readonly sharing: Sharing;
  readonly ports: Ports;
  readonly catalog: Catalog;
  readonly bundles: Bundles;
  readonly templates: Templates;
  readonly teams: Teams;
  readonly billing: Billing;
  readonly apiKeys: ApiKeys;
  readonly demos: Demos;
  readonly recordings: TeamRecordings;

  constructor(opts: CapsulateOptions = {}) {
    const apiKey = opts.apiKey ?? envGet("CAPSULATE_API_KEY");
    const token = opts.token ?? envGet("CAPSULATE_TOKEN");
    const baseUrl = opts.baseUrl ?? envGet("CAPSULATE_BASE_URL") ?? DEFAULT_BASE_URL;
    this.configuredTeamId = opts.teamId ?? envGet("CAPSULATE_TEAM_ID");

    const httpCfg: HttpConfig = {
      baseUrl,
      apiKey,
      token,
      timeoutMs: opts.timeoutMs,
      fetch: opts.fetch,
      headers: opts.headers,
      userAgent: opts.userAgent,
    };
    this.http = new Http(httpCfg);

    const ctx: ClientContext = {
      http: this.http,
      resolveTeamId: (explicit?: string) => this.resolveTeamId(explicit),
    };

    this.capsules = new Capsules(ctx);
    this.volumes = new Volumes(ctx);
    this.sharing = new Sharing(this.http);
    this.ports = new Ports(this.http);
    this.catalog = new Catalog(ctx);
    this.bundles = new Bundles(ctx);
    this.templates = new Templates(ctx);
    this.teams = new Teams(ctx);
    this.billing = new Billing(ctx);
    this.apiKeys = new ApiKeys(ctx);
    this.demos = new Demos(ctx);
    this.recordings = new TeamRecordings(ctx);
  }

  /**
   * Resolve the team id for a team-scoped call: the explicit argument, else the
   * configured/default team, else the caller's first team (fetched + cached).
   */
  async resolveTeamId(explicit?: string): Promise<string> {
    if (explicit) return explicit;
    if (this.configuredTeamId) return this.configuredTeamId;
    if (this.cachedTeamId) return this.cachedTeamId;
    const teams = await this.http.get<TeamSummary[]>(`/teams`);
    if (!teams || teams.length === 0) {
      throw new CapsulateError(
        "No team found for these credentials, and no teamId was provided. Pass teamId explicitly.",
        { status: 400, request: { method: "GET", path: "/teams" } },
      );
    }
    this.cachedTeamId = teams[0]!.id;
    return this.cachedTeamId;
  }
}
