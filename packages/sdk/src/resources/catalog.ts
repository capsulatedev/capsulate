// Catalog surfaces — what you can launch and what it costs. The control plane is
// the source of truth (§16); these are read-only.

import type { ClientContext } from "../internal.js";
import type { Bundle, CatalogArtifact, Template } from "../types.js";

export class Catalog {
  constructor(private readonly ctx: ClientContext) {}

  /** The golden-image catalog (operating systems / base templates). */
  list(): Promise<CatalogArtifact[]> {
    return this.ctx.http.get<CatalogArtifact[]>(`/catalog`);
  }
}

export class Bundles {
  constructor(private readonly ctx: ClientContext) {}

  /** The Bucket-B marketplace bundles with live availability (instant / on-demand). */
  list(): Promise<Bundle[]> {
    return this.ctx.http.get<Bundle[]>(`/bundles`);
  }
}

export class Templates {
  constructor(private readonly ctx: ClientContext) {}

  /** The team's saved templates ("Your templates" library). Launch via capsules.create({ snapshot }). */
  async list(teamId?: string): Promise<Template[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<Template[]>(`/teams/${encodeURIComponent(tid)}/templates`);
  }
}
