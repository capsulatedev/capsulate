// Demo links (Path B, Phase 10b) — public, shareable/embeddable links that launch a
// live capsule from a template for any visitor (no account), billed to your team.
// This resource manages them programmatically; visitors launch via the public viewer.

import type { ClientContext } from "../internal.js";
import type { DemoLink, DemoSession, CreateDemoOptions } from "../types.js";

const enc = encodeURIComponent;

export class Demos {
  constructor(private readonly ctx: ClientContext) {}

  async create(opts: CreateDemoOptions): Promise<DemoLink> {
    const teamId = await this.ctx.resolveTeamId(opts.teamId);
    return this.ctx.http.post<DemoLink>(`/demos`, {
      teamId,
      name: opts.name,
      templateId: opts.templateId,
      size: opts.size ?? "2c4g",
      region: opts.region,
      permission: opts.permission ?? "interactive",
      ttlMinutes: opts.ttlMinutes ?? 30,
      maxConcurrent: opts.maxConcurrent ?? 0,
      requireEmail: opts.requireEmail ?? false,
      record: opts.record ?? false,
    });
  }

  async list(teamId?: string): Promise<DemoLink[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<DemoLink[]>(`/demos`, { query: { teamId: tid } });
  }

  get(id: string): Promise<DemoLink> {
    return this.ctx.http.get<DemoLink>(`/demos/${enc(id)}`);
  }

  update(id: string, patch: Partial<DemoLink>): Promise<DemoLink> {
    return this.ctx.http.patch<DemoLink>(`/demos/${enc(id)}`, patch);
  }

  delete(id: string): Promise<void> {
    return this.ctx.http.delete<void>(`/demos/${enc(id)}`);
  }

  /** Analytics: the demo's visits (who, when, duration, replay recording). */
  sessions(id: string): Promise<DemoSession[]> {
    return this.ctx.http.get<DemoSession[]>(`/demos/${enc(id)}/sessions`);
  }

  /** The public shareable URL for a demo link (host derived from the SDK base URL). */
  url(id: string, appOrigin?: string): string {
    const origin = appOrigin ?? "https://app.capsulate.dev";
    return `${origin.replace(/\/+$/, "")}/demo/${id}`;
  }
}
