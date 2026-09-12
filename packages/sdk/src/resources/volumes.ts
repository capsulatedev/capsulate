// Persistent volumes (Phase 9e §31). A sized block device that survives capsule
// destroy and re-attaches across compute nodes when network-homed. Billed GB-month.

import type { ClientContext } from "../internal.js";
import type {
  Volume,
  VolumeList,
  CreateVolumeOptions,
  VolumeAttachResult,
} from "../types.js";

const enc = encodeURIComponent;

export class Volumes {
  constructor(private readonly ctx: ClientContext) {}

  async create(opts: CreateVolumeOptions): Promise<Volume> {
    const teamId = await this.ctx.resolveTeamId(opts.teamId);
    return this.ctx.http.post<Volume>(`/volumes`, {
      teamId,
      name: opts.name,
      sizeGb: opts.sizeGb,
      ...(opts.region ? { region: opts.region } : {}),
    });
  }

  /** List the team's volumes. */
  async list(teamId?: string): Promise<Volume[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    const res = await this.ctx.http.get<VolumeList>(`/volumes`, { query: { teamId: tid } });
    return res.volumes ?? [];
  }

  get(volumeId: string): Promise<Volume> {
    return this.ctx.http.get<Volume>(`/volumes/${enc(volumeId)}`);
  }

  delete(volumeId: string): Promise<void> {
    return this.ctx.http.delete<void>(`/volumes/${enc(volumeId)}`);
  }

  /** List the volumes attached to a capsule. */
  async listForCapsule(sessionId: string): Promise<Volume[]> {
    const res = await this.ctx.http.get<VolumeList>(`/sessions/${enc(sessionId)}/volumes`);
    return res.volumes ?? [];
  }

  attach(
    sessionId: string,
    volumeId: string,
    opts: { mountPath?: string; readOnly?: boolean } = {},
  ): Promise<VolumeAttachResult> {
    return this.ctx.http.post<VolumeAttachResult>(
      `/sessions/${enc(sessionId)}/volumes/${enc(volumeId)}/attach`,
      { mountPath: opts.mountPath, readOnly: opts.readOnly ?? false },
    );
  }

  detach(sessionId: string, volumeId: string): Promise<Volume> {
    return this.ctx.http.post<Volume>(`/sessions/${enc(sessionId)}/volumes/${enc(volumeId)}/detach`);
  }
}
