// The inbox (Phase SK): what waits for someone in a team. Runs that ask a question or are stuck on a step, versions
// that wait for approval, versions whose rehearsal failed, and skills whose software changed. It is read from the
// runs and versions, so an item leaves by itself when it is dealt with.
//
//   for (const item of await cap.inbox.list()) console.log(item.kind, item.title);

import type { ClientContext } from "../internal.js";
import type { InboxItem } from "../types.js";

export class Inbox {
  constructor(private readonly ctx: ClientContext) {}

  /** What waits for someone in the team, newest first. */
  async list(opts: { teamId?: string } = {}): Promise<InboxItem[]> {
    const tid = opts.teamId ?? (await this.ctx.resolveTeamId().catch(() => undefined));
    const out = await this.ctx.http.get<{ items: InboxItem[] }>("/inbox", { query: tid ? { teamId: tid } : {} });
    return out.items ?? [];
  }
}
