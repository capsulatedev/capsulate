// Recordings — watch / record / replay (Phase 5.5 §11, on-demand A5). The signature
// observability feature: capture what an agent did inside a desktop capsule.

import type { Http } from "../http.js";
import type { ClientContext } from "../internal.js";
import type { Recording, RecordingList, RecordingStatus } from "../types.js";

const enc = encodeURIComponent;

/** Team-wide recordings (Phase 10b) — every recording across capsules + demo links. */
export class TeamRecordings {
  constructor(private readonly ctx: ClientContext) {}

  /** List all of the team's recordings (capsule + demo replays). */
  async list(teamId?: string): Promise<Recording[]> {
    const tid = await this.ctx.resolveTeamId(teamId);
    return this.ctx.http.get<Recording[]>(`/recordings`, { query: { teamId: tid } });
  }

  /** Delete a recording (stops its GB-month billing). */
  delete(recordingId: string): Promise<void> {
    return this.ctx.http.delete<void>(`/recordings/${enc(recordingId)}`);
  }
}

export class Recordings {
  constructor(private readonly http: Http) {}

  /** List a capsule's recordings (works even after the capsule is destroyed). */
  async list(sessionId: string): Promise<Recording[]> {
    const res = await this.http.get<RecordingList>(`/sessions/${enc(sessionId)}/recordings`);
    return res.recordings ?? [];
  }

  /** Start an on-demand desktop recording. */
  start(sessionId: string): Promise<RecordingStatus> {
    return this.http.post<RecordingStatus>(`/sessions/${enc(sessionId)}/recordings/start`);
  }

  /** Stop the active recording; returns the saved Recording (or a "nothing captured" marker). */
  stop(sessionId: string): Promise<Recording | { recording: false; captured: false }> {
    return this.http.post(`/sessions/${enc(sessionId)}/recordings/stop`);
  }

  status(sessionId: string): Promise<RecordingStatus> {
    return this.http.get<RecordingStatus>(`/sessions/${enc(sessionId)}/recordings/status`);
  }

  /** Download a recording's bytes (mp4). Returns the raw Response for streaming/saving. */
  async download(sessionId: string, recordingId: string): Promise<Response> {
    return this.http.request<Response>(
      "GET",
      `/sessions/${enc(sessionId)}/recordings/${enc(recordingId)}`,
      { raw: true },
    );
  }

  /** Download a recording fully into an ArrayBuffer. */
  async downloadBytes(sessionId: string, recordingId: string): Promise<ArrayBuffer> {
    const res = await this.download(sessionId, recordingId);
    return res.arrayBuffer();
  }
}
