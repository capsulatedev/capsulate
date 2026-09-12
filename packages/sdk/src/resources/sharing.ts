// Sharing (§10) — collaborators (persistent access) and guests, plus port
// forwarding and spectate. Two distinct concepts named separately on the wire.

import type { Http } from "../http.js";
import type {
  GuestInvite,
  GuestInviteResult,
  SessionGuest,
  Permission,
  PortForward,
} from "../types.js";

const enc = encodeURIComponent;

export class Sharing {
  constructor(private readonly http: Http) {}

  /** Create share links for one or more guests. */
  share(sessionId: string, guests: GuestInvite[]): Promise<GuestInviteResult[]> {
    return this.http.post<GuestInviteResult[]>(`/sessions/${enc(sessionId)}/share`, { guests });
  }

  /** List a capsule's active guests. */
  guests(sessionId: string): Promise<SessionGuest[]> {
    return this.http.get<SessionGuest[]>(`/sessions/${enc(sessionId)}/guests`);
  }

  setGuestPermission(guestId: string, permission: Permission): Promise<SessionGuest> {
    return this.http.patch<SessionGuest>(`/guests/${enc(guestId)}/permission`, { permission });
  }

  removeGuest(guestId: string): Promise<void> {
    return this.http.delete<void>(`/guests/${enc(guestId)}`);
  }

  /** Start co-watching (read-only live view). */
  spectate(sessionId: string): Promise<unknown> {
    return this.http.post(`/sessions/${enc(sessionId)}/spectate`);
  }
}

export class Ports {
  constructor(private readonly http: Http) {}

  /** Forward a port from inside the capsule to a public endpoint. */
  forward(sessionId: string, localPort: number, name?: string): Promise<PortForward> {
    return this.http.post<PortForward>(`/sessions/${enc(sessionId)}/ports`, {
      privatePort: localPort,
      ...(name ? { name } : {}),
    });
  }

  remove(sessionId: string, publicPort: number): Promise<void> {
    return this.http.delete<void>(`/sessions/${enc(sessionId)}/ports/${publicPort}`);
  }
}
