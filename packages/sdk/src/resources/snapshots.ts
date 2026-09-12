// Snapshots — delta capture + billable restore (Phase 9d §28). A snapshot is a
// node-local ZFS CoW delta of the capsule's disk that outlives it. Restore is a
// clone-from-snapshot launch: capsules.create({ snapshot: id }).

import type { Http } from "../http.js";
import type { Snapshot, SnapshotList } from "../types.js";

const enc = encodeURIComponent;

export class Snapshots {
  constructor(private readonly http: Http) {}

  /** List a capsule's snapshots. */
  async list(sessionId: string): Promise<Snapshot[]> {
    const res = await this.http.get<SnapshotList>(`/sessions/${enc(sessionId)}/snapshots`);
    return res.snapshots ?? [];
  }

  /** Capture a snapshot of the capsule's current state. Billed by stored delta bytes. */
  create(sessionId: string, name?: string): Promise<Snapshot> {
    return this.http.post<Snapshot>(`/sessions/${enc(sessionId)}/snapshot`, name ? { name } : {});
  }

  /** Delete a snapshot (reclaims its stored bytes). */
  delete(sessionId: string, snapshotId: string): Promise<void> {
    return this.http.delete<void>(`/sessions/${enc(sessionId)}/snapshots/${enc(snapshotId)}`);
  }
}
