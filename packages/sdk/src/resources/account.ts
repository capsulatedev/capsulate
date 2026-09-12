// Account surfaces — teams, billing, pricing/availability, and API-key management.
// These work with both interactive (token) and API-key credentials.

import type { ClientContext } from "../internal.js";
import type {
  TeamSummary,
  BillingBalance,
  ApiKey,
  CreateApiKeyOptions,
  CreatedApiKey,
} from "../types.js";

const enc = encodeURIComponent;

export class Teams {
  constructor(private readonly ctx: ClientContext) {}

  /** List the teams the caller belongs to. */
  list(): Promise<TeamSummary[]> {
    return this.ctx.http.get<TeamSummary[]>(`/teams`);
  }

  members(teamId?: string): Promise<unknown[]> {
    return this.ctx
      .resolveTeamId(teamId)
      .then((tid) => this.ctx.http.get<unknown[]>(`/teams/${enc(tid)}/members`));
  }
}

export class Billing {
  constructor(private readonly ctx: ClientContext) {}

  /** The team's current credit balance. */
  async balance(teamId?: string): Promise<BillingBalance> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<BillingBalance>(`/teams/${enc(tid)}/billing/balance`);
  }

  /** Get the platform pricing table (per-size + per-meter rates). */
  pricing(): Promise<unknown> {
    return this.ctx.http.get<unknown>(`/pricing`);
  }

  /** Launch availability for a template (sizes/regions with capacity). */
  availability(templateId: string): Promise<unknown> {
    return this.ctx.http.get<unknown>(`/availability`, { query: { templateId } });
  }
}

export class ApiKeys {
  constructor(private readonly ctx: ClientContext) {}

  async list(teamId?: string): Promise<ApiKey[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<ApiKey[]>(`/teams/${enc(tid)}/api-keys`);
  }

  /** Create an API key. The plaintext `key` is returned exactly once. */
  async create(opts: CreateApiKeyOptions, teamId?: string): Promise<CreatedApiKey> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.post<CreatedApiKey>(`/teams/${enc(tid)}/api-keys`, opts);
  }

  async revoke(keyId: string, teamId?: string): Promise<void> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.delete<void>(`/teams/${enc(tid)}/api-keys/${enc(keyId)}`);
  }
}
