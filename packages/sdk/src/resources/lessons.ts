// Lessons (Phase SK, decision 56): teaching sessions a skill is learned from. While a lesson records on a capsule,
// every action taken there through the API is logged in full, notes and marks go in, and keyframes are taken; at the
// end the digest puts it in plain words for the AI to write the skill, or a draft makes one.
//
//   const lesson = await cap.lessons.start({ sessionId: capsule.id, title: "Export a PDF", goal: "...", mode: "ai" });
//   ... work on the capsule; await cap.lessons.note(lesson.lessonId, "The export dialog hides under Advanced");
//   await cap.lessons.finish(lesson.lessonId);
//   const digest = await cap.lessons.digest(lesson.lessonId);   // then cap.skills.save(...)

import { CapsulateError } from "../errors.js";
import type { ClientContext } from "../internal.js";
import type { Lesson, LessonDigest, LessonEvent, LessonStartInput, SkillDetail } from "../types.js";

const enc = encodeURIComponent;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class Lessons {
  constructor(private readonly ctx: ClientContext) {}

  /** Start a lesson on a capsule (one at a time per capsule). */
  async start(input: LessonStartInput): Promise<Lesson> {
    const body: Record<string, unknown> = { ...input };
    if (!body.teamId) {
      const tid = await this.ctx.resolveTeamId().catch(() => undefined);
      if (tid) body.teamId = tid;
    }
    return this.ctx.http.post<Lesson>("/lessons", body);
  }

  get(lessonId: string): Promise<Lesson> {
    return this.ctx.http.get<Lesson>(`/lessons/${enc(lessonId)}`);
  }

  /** The lesson recording (or paused) on a capsule, or null when none is. */
  async onCapsule(sessionId: string): Promise<Lesson | null> {
    try {
      return await this.ctx.http.get<Lesson>(`/sessions/${enc(sessionId)}/lesson`);
    } catch (err) {
      if (err instanceof CapsulateError && err.status === 404) return null;
      throw err;
    }
  }

  /** The team's lessons, newest first. */
  async list(opts: { status?: string; teamId?: string; limit?: number } = {}): Promise<Lesson[]> {
    const tid = opts.teamId ?? (await this.ctx.resolveTeamId().catch(() => undefined));
    const query: Record<string, string> = {};
    if (tid) query.teamId = tid;
    if (opts.status) query.status = opts.status;
    if (opts.limit) query.limit = String(opts.limit);
    const out = await this.ctx.http.get<{ lessons: Lesson[] }>("/lessons", { query });
    return out.lessons ?? [];
  }

  /** Add a note; mark a region of the screen with it, or take a keyframe. */
  note(lessonId: string, text: string, opts: { mark?: { x: number; y: number; w: number; h: number }; screenshot?: boolean } = {}): Promise<{ ok: boolean; frame?: number }> {
    return this.ctx.http.post(`/lessons/${enc(lessonId)}/notes`, { text, ...opts });
  }

  pause(lessonId: string): Promise<Lesson> {
    return this.ctx.http.post<Lesson>(`/lessons/${enc(lessonId)}/pause`, {});
  }
  resume(lessonId: string): Promise<Lesson> {
    return this.ctx.http.post<Lesson>(`/lessons/${enc(lessonId)}/resume`, {});
  }
  /** End the lesson: its last events are saved and what changed on the capsule is noted. */
  finish(lessonId: string): Promise<Lesson> {
    return this.ctx.http.post<Lesson>(`/lessons/${enc(lessonId)}/finish`, {});
  }
  /** Delete the lesson, its events and its keyframes. */
  async discard(lessonId: string): Promise<void> {
    await this.ctx.http.post(`/lessons/${enc(lessonId)}/discard`, {});
  }

  /**
   * Send a chunk of the teacher's voice (a lesson started with voice), in order: part 1, 2... (a pause ends one), seq
   * 0, 1... within a part; the first chunk says where the part starts on the lesson clock; the last (it may be empty)
   * sends the part to be turned into text. Any audio ffmpeg reads; at most 4 MB a chunk.
   */
  addAudio(
    lessonId: string,
    chunk: { part: number; seq: number; start?: number; last?: boolean; contentType?: string; data: Uint8Array },
  ): Promise<{ part: number; chunks: number; last: boolean }> {
    const { data, ...rest } = chunk;
    return this.ctx.http.post(`/lessons/${enc(lessonId)}/audio`, { ...rest, data: toBase64(data) });
  }

  /** The lesson's events after a seq (a page at a time). */
  events(lessonId: string, opts: { after?: number; limit?: number } = {}): Promise<{ events: LessonEvent[]; next?: number }> {
    const query: Record<string, string> = {};
    if (opts.after) query.after = String(opts.after);
    if (opts.limit) query.limit = String(opts.limit);
    return this.ctx.http.get(`/lessons/${enc(lessonId)}/events`, { query });
  }

  /** The lesson in plain words: what the AI reads to write the skill. */
  digest(lessonId: string): Promise<LessonDigest> {
    return this.ctx.http.get<LessonDigest>(`/lessons/${enc(lessonId)}/digest`);
  }

  /** A keyframe (JPEG bytes). */
  async frame(lessonId: string, n: number): Promise<Uint8Array> {
    const res = await this.ctx.http.request<Response>("GET", `/lessons/${enc(lessonId)}/frames/${n}`, { raw: true });
    return new Uint8Array(await res.arrayBuffer());
  }

  /** A draft version from a finished lesson: a new skill (name it with skill), or a new procedure in an existing one. */
  draft(lessonId: string, opts: { skill?: string; description?: string } = {}): Promise<SkillDetail> {
    return this.ctx.http.post<SkillDetail>(`/lessons/${enc(lessonId)}/draft`, opts);
  }
}
