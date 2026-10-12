// Skills (Phase SK, decision 56): learn once, repeat in minutes. A skill is an Agent Skills folder (SKILL.md, the
// open standard) plus capsulate/skill.json: the environment it was learned on, procedures (parameterized run steps),
// checks and traps. Every write makes a new version; nothing replaces the version that runs until it is approved.
//
//   const cap = new Capsulate();
//   await cap.skills.save({ name: "krita-painting", description: "Paint in Krita 5 on Linux. Use when asked to paint.",
//                           instructions: "# Krita\n...", spec: { procedures: { set_color: { steps: [...] } } } });
//   const { skill, version } = await cap.skills.get("krita-painting");

import type { ClientContext } from "../internal.js";
import { CapsulateError } from "../errors.js";
import type {
  Run,
  Skill,
  SkillDetail,
  SkillEnvironmentInput,
  SkillEnvironmentResult,
  SkillImportInput,
  SkillStatus,
  SkillVersion,
  SkillWriteInput,
} from "../types.js";

const enc = encodeURIComponent;

/** Base64 of bytes, in Node and browsers. */
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The name a write gives: `name`, or the SKILL.md frontmatter's. */
function writeName(input: SkillWriteInput): string | undefined {
  if (input.name) return input.name;
  const m = /^name:\s*["']?([a-z0-9-]+)["']?\s*$/m.exec(input.skillMd ?? "");
  return m?.[1];
}

export class Skills {
  constructor(private readonly ctx: ClientContext) {}

  /** The path of a skill, and the team to look a name up in (an id, skl_..., needs none). */
  private async ref(skill: string, teamId?: string): Promise<{ path: string; query: Record<string, string> }> {
    const query: Record<string, string> = {};
    if (!skill.startsWith("skl_")) {
      const tid = teamId ?? (await this.ctx.resolveTeamId().catch(() => undefined));
      if (tid) query.teamId = tid;
    }
    return { path: `/skills/${enc(skill)}`, query };
  }

  /** The team's library; q matches the name or the description. */
  async list(opts: { q?: string; status?: SkillStatus; teamId?: string } = {}): Promise<Skill[]> {
    const teamId = await this.ctx.resolveTeamId(opts.teamId);
    const res = await this.ctx.http.get<{ skills: Skill[] }>(`/skills`, {
      query: { teamId, q: opts.q, status: opts.status },
    });
    return res.skills ?? [];
  }

  /** A skill with its current version (or the version asked for). */
  async get(skill: string, opts: { version?: number; teamId?: string } = {}): Promise<SkillDetail> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.get<SkillDetail>(r.path, { query: { ...r.query, version: opts.version } });
  }

  /** A new skill and its first version (current unless state says otherwise). */
  async create(input: SkillWriteInput): Promise<SkillDetail> {
    const teamId = await this.ctx.resolveTeamId(input.teamId);
    return this.ctx.http.post<SkillDetail>(`/skills`, { ...input, teamId });
  }

  /** A new version of a skill: what it leaves out is kept from its base version. Proposed by default. */
  async addVersion(skill: string, input: SkillWriteInput): Promise<SkillDetail> {
    const r = await this.ref(skill, input.teamId);
    return this.ctx.http.post<SkillDetail>(`${r.path}/versions`, input, { query: r.query });
  }

  /**
   * Save what you learned: create the skill, or add a proposed version when the team already has one by that name
   * (the name comes from `name` or the SKILL.md).
   */
  async save(input: SkillWriteInput): Promise<SkillDetail> {
    try {
      return await this.create(input);
    } catch (err) {
      const name = writeName(input);
      if (!(err instanceof CapsulateError) || err.status !== 409 || !name) throw err;
      return this.addVersion(name, input);
    }
  }

  /** A skill's versions, newest first, without their content. */
  async versions(skill: string, opts: { teamId?: string } = {}): Promise<SkillVersion[]> {
    const r = await this.ref(skill, opts.teamId);
    const res = await this.ctx.http.get<{ versions: SkillVersion[] }>(`${r.path}/versions`, { query: r.query });
    return res.versions ?? [];
  }

  /** One version with its content. */
  async version(skill: string, version: number, opts: { teamId?: string } = {}): Promise<SkillVersion> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.get<SkillVersion>(`${r.path}/versions/${version}`, { query: r.query });
  }

  /** Make a version current. It needs a passing rehearsal unless force (the owner skipping it). */
  async approve(skill: string, version: number, opts: { force?: boolean; note?: string; teamId?: string } = {}): Promise<SkillDetail> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.post<SkillDetail>(`${r.path}/versions/${version}/approve`, { force: opts.force, note: opts.note }, { query: r.query });
  }

  /** Reject a draft or proposed version. */
  async reject(skill: string, version: number, opts: { teamId?: string } = {}): Promise<SkillDetail> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.post<SkillDetail>(`${r.path}/versions/${version}/reject`, {}, { query: r.query });
  }

  /** Make an earlier version current again. */
  async rollback(skill: string, version: number, opts: { teamId?: string } = {}): Promise<SkillDetail> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.post<SkillDetail>(`${r.path}/rollback`, { version }, { query: r.query });
  }

  /**
   * Save a capsule as the skill's environment: the capsule becomes a saved template (the software installed and set
   * up as it is now), and a new version of the skill launches from it. Launch it with
   * `cap.capsules.launch({ skill })`.
   */
  async environment(skill: string, input: SkillEnvironmentInput, opts: { teamId?: string } = {}): Promise<SkillEnvironmentResult> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.post<SkillEnvironmentResult>(`${r.path}/environment`, input, { query: r.query });
  }

  /**
   * Rehearse a version: in a fresh capsule launched from its environment (destroyed after unless keep), or on the
   * capsule sessionId names: the fingerprint, then every check. A version replaces the current one only after a
   * passing rehearsal (or approve with force). Follow the returned run with `cap.runs.wait(run.runId)`.
   */
  async rehearse(skill: string, version: number, opts: { sessionId?: string; keep?: boolean; teamId?: string } = {}): Promise<Run> {
    const r = await this.ref(skill, opts.teamId);
    const body: Record<string, unknown> = {};
    if (opts.sessionId) body.sessionId = opts.sessionId;
    if (opts.keep) body.keep = true;
    return this.ctx.http.post<Run>(`${r.path}/versions/${version}/rehearse`, body, { query: r.query });
  }

  /** Rehearse the current version every week (as you, in a fresh capsule), to notice when the software changes. */
  async setWeekly(skill: string, on: boolean, opts: { teamId?: string } = {}): Promise<SkillDetail> {
    return this.update(skill, { rehearseWeekly: on }, opts);
  }

  /** Archive or restore a skill, or turn its weekly rehearsal on or off. */
  async update(skill: string, patch: { status?: SkillStatus; rehearseWeekly?: boolean }, opts: { teamId?: string } = {}): Promise<SkillDetail> {
    const r = await this.ref(skill, opts.teamId);
    return this.ctx.http.patch<SkillDetail>(r.path, patch, { query: r.query });
  }

  async delete(skill: string, opts: { teamId?: string } = {}): Promise<void> {
    const r = await this.ref(skill, opts.teamId);
    await this.ctx.http.delete<void>(r.path, { query: r.query });
  }

  /** The skill folder as a zip (<name>/SKILL.md, <name>/capsulate/skill.json, files). */
  async export(skill: string, opts: { version?: number; teamId?: string } = {}): Promise<Uint8Array> {
    const r = await this.ref(skill, opts.teamId);
    const res = await this.ctx.http.request<Response>("GET", `${r.path}/export`, {
      raw: true,
      query: { ...r.query, version: opts.version },
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  /** One file of a version (SKILL.md and capsulate/skill.json included). */
  async file(skill: string, path: string, opts: { version?: number; teamId?: string } = {}): Promise<Uint8Array> {
    const r = await this.ref(skill, opts.teamId);
    const res = await this.ctx.http.request<Response>("GET", `${r.path}/files/${path.split("/").map(enc).join("/")}`, {
      raw: true,
      query: { ...r.query, version: opts.version },
    });
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Import a skill folder (a zip, or its parts). A skill of the same name gets a proposed version. */
  async import(input: SkillImportInput): Promise<SkillDetail> {
    const teamId = await this.ctx.resolveTeamId(input.teamId);
    const { zip, ...rest } = input;
    const zipB64 = zip ? bytesToBase64(zip instanceof Uint8Array ? zip : new Uint8Array(zip)) : input.zipB64;
    return this.ctx.http.post<SkillDetail>(`/skills/import`, { ...rest, zipB64, teamId });
  }
}
