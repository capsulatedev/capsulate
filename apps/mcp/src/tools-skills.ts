// Phase SK — the MCP tools for skills (decision 56): learn once, repeat in minutes. A skill is an Agent Skills folder
// (SKILL.md) plus capsulate/skill.json (environment, frames, inputs, procedures, checks, traps). The model reads skills
// before working in an application and saves what it learned after.

import { z } from "zod";
import type { InboxItem, Lesson, LessonDigest, Run, SkillDetail, SkillSpec, SkillVersion } from "@capsulate/sdk";
import type { ToolKit } from "./tools-live.js";

/** Guidance the MCP client shows the model: use what was learned before, and keep what you learn. */
export const SKILLS_INSTRUCTIONS = [
  "Skills are what you or a person taught Capsulate before: how to use an application (where things are, the steps that work, the traps) or how an expert works. Before a task in an application, list the team's skills (capsulate_skills action 'list', with a query) and read the one that fits (action 'get'): follow its instructions, reuse its procedures and avoid its traps instead of discovering the application again.",
  "When you learned something worth keeping (an application's layout, steps you repeated, a trap you hit and how you got past it), save it (capsulate_skills action 'save'): a name and a description that says when to use it, instructions in plain words, procedures with the steps as run_actions steps using {{param}} placeholders, and traps with their fix. A new skill's first version is current; a later version is proposed until the owner approves it. Never put passwords, keys or personal data in a skill.",
  "To learn an application (asked to, or before a long job in software no skill covers): start a lesson (capsulate_lesson action 'start', mode 'ai', a goal), explore toward the goal with the capsulate tools (capsulate_menus shows an application's commands cheaply), add a note whenever you learn something or hit a trap and get past it, then finish the lesson, read its digest (action 'get') and save the skill (capsulate_skills action 'save' with lessonId). When a person wants to teach you: start a lesson with mode 'human', share the console link, let them work and talk; when they say they are done, finish it and write the skill from the digest.",
  "To use a skill: launch its environment (capsulate_launch with skill: the software is installed and its setup has run), then run its procedure with capsulate_skill_run (in the background, no time limit, it asks you only where the skill leaves a decision open), or call procedures from capsulate_run_actions with {do: 'use', procedure, args} while you work. When a run waits for help, look at the screen and continue it: retry, skip, or the steps that work instead (they are kept as a proposed fix to the skill).",
].join("\n");

function paramsOf(p: { params?: Record<string, { type: string; required?: boolean }> }): string {
  return Object.entries(p.params ?? {})
    .map(([n, d]) => `${n}${d.required ? "" : "?"}: ${d.type}`)
    .join(", ");
}

/** A skill as the model reads it: what it is for, its instructions, procedures, traps and environment. */
function describeSkill(d: SkillDetail, part: "all" | "instructions" | "spec"): string {
  const k = d.skill;
  const v: SkillVersion | undefined = d.version;
  if (!v) return `${k.name} has no version yet.`;
  if (part === "spec") return JSON.stringify(v.spec ?? {}, null, 2);
  const head = `${k.name}, version ${v.version} (${v.state}${k.currentVersion === v.version ? ", the one that runs" : ""}). ${k.description}`;
  if (part === "instructions") return `${head}\n\n${v.skillMd}`;
  const spec: SkillSpec = v.spec ?? {};
  const lines = [head, "", v.skillMd.trim()];
  const procs = Object.entries(spec.procedures ?? {});
  if (procs.length) {
    lines.push("", "Procedures (call one in capsulate_run_actions with {do: 'use', skill, procedure, args}, or read its steps with part 'spec'):");
    for (const [name, p] of procs) lines.push(`- ${name}(${paramsOf(p)}): ${p.description ?? `${p.steps.length} steps`}`);
  }
  if (spec.traps?.length) {
    lines.push("", "Traps:");
    for (const t of spec.traps) lines.push(`- ${t.title}${t.fix ? `. Fix: ${t.fix}` : ""}`);
  }
  const env = spec.environment;
  if (env) {
    const where = env.snapshotId ? `a saved template (${env.snapshotId})` : env.image ? `the template ${env.image}` : "";
    lines.push("", `Environment: ${[where, env.os, env.size, env.setup ? `setup procedure '${env.setup}'` : ""].filter(Boolean).join(", ")}.`);
  }
  if (spec.frames && Object.keys(spec.frames).length) {
    lines.push(`Frames: ${Object.entries(spec.frames).map(([n, f]) => `${n} (origin ${f.origin.join(",")}, scale ${f.scale})`).join("; ")}. A step with frame: '<name>' takes that frame's coordinates.`);
  }
  if (v.files?.length) lines.push(`Files: ${v.files.map((f) => f.path).join(", ")}.`);
  return lines.join("\n");
}

/** A run as the model reads it: where it is, what it needs, and its last steps. */
export function runText(r: Run): string {
  const secs = (r.workMs / 1000).toFixed(1);
  const head = `Run ${r.runId}${r.skillName ? ` of ${r.skillName}${r.version ? ` version ${r.version}` : ""}${r.procedure ? ` (${r.procedure})` : ""}` : ""}: ${r.status.replace("_", " ")} after ${r.done} steps in ${secs} s (${r.replayed} replayed, ${r.asked} asked, ${r.fixed} fixed).`;
  const lines = [head];
  const w = r.waiting;
  if (w?.reason === "ask") {
    lines.push(`It asks: ${w.question}${w.options?.length ? ` Options: ${w.options.join(", ")}.` : ""}${w.context && w.context !== "none" ? ` Look at the ${w.context === "ui_tree" ? "UI tree" : "screen"} to decide.` : ""}`);
    lines.push(`Answer with action 'continue', runId '${r.runId}', values {${(w.gives ?? []).map((g) => `${g}: ...`).join(", ")}} (or action 'skip').`);
  } else if (w) {
    const why = w.reason === "human_in_control" ? "a person holds the screen" : w.reason === "interrupted" ? "the server restarted" : w.error ?? "it failed";
    lines.push(`It is stuck at ${w.where ?? "a step"}${w.step ? ` (${w.step.do})` : ""}: ${why}.`);
    lines.push(`Look at the screen, then continue with action 'retry', 'skip', or steps to run instead (kept as a proposed fix).`);
  }
  if (r.error) lines.push(r.error);
  if (r.outcome?.proposedVersion) lines.push(`The steps you gave are proposed as version ${r.outcome.proposedVersion} of ${r.skillName}; the owner approves it.`);
  if (r.outcome?.variables && Object.keys(r.outcome.variables).length) lines.push(`Values: ${JSON.stringify(r.outcome.variables).slice(0, 1000)}`);
  const recent = (r.steps ?? []).slice(-6);
  if (recent.length) {
    lines.push("Last steps:");
    for (const s of recent) lines.push(`${s.seq}. ${s.where ? `${s.where} ` : ""}${s.do} ${s.ok ? s.kind : `FAILED: ${s.error ?? ""}`}`);
  }
  return lines.join("\n");
}

const fileSchema = z.object({
  path: z.string().describe("Relative path in the skill folder, e.g. scripts/plan.py or references/menus.md"),
  content: z.string().optional().describe("Text content"),
  contentB64: z.string().optional().describe("Or the bytes, base64"),
});

export function registerSkillTools(t: ToolKit) {
  const { server, cap, ok, err } = t;

  server.registerTool(
    "capsulate_skills",
    {
      title: "Skills: what was learned before, and what you learned",
      description: [
        "The team's skills. action 'list' (query?) lists them; 'get' (skill, version?, part?: 'all' | 'instructions' | 'spec') reads one, its instructions, procedures, traps and environment, so you do not have to discover the application again.",
        "'save' keeps what you learned: skillMd (a whole SKILL.md) or name + description (what it does and when to use it) + instructions (Markdown), and spec (capsulate/skill.json: environment, frames, inputs, procedures as run_actions steps with {{param}} placeholders, checks, traps) and files. It creates the skill, or adds a proposed version when the team has one by that name; what a new version leaves out is kept.",
        "'versions' (skill) lists versions; 'approve' (skill, version, force?) makes one current (a passing rehearsal, or force); 'reject' and 'rollback' (skill, version); 'archive' and 'unarchive' (skill).",
        "'environment' (skill, sessionId, setup?) saves the capsule as the skill's environment once the software is installed and set up: a saved template, and a version that launches from it (capsulate_launch with skill), its setup procedure run after each launch.",
        "'rehearse' (skill, version, sessionId?, keep?) proves a version before it is approved: a fresh capsule from its environment (or the capsule given), its fingerprint and checks; follow it with capsulate_skill_run get. 'weekly' (skill, on) rehearses the current version every week to notice when the software changes.",
      ].join(" "),
      inputSchema: {
        action: z.enum(["list", "get", "save", "versions", "approve", "reject", "rollback", "archive", "unarchive", "environment", "rehearse", "weekly"]),
        skill: z.string().optional().describe("The skill's name (or id, skl_...)"),
        query: z.string().optional().describe("For list: words to match in the name or description"),
        version: z.number().int().positive().optional(),
        part: z.enum(["all", "instructions", "spec"]).optional().describe("For get: everything (default), only the SKILL.md, or only the spec (the procedures' steps)"),
        skillMd: z.string().optional().describe("For save: the whole SKILL.md (frontmatter with name and description, then instructions)"),
        name: z.string().optional().describe("For save: lowercase letters, digits and hyphens, e.g. krita-painting"),
        description: z.string().optional().describe("For save: what the skill does and when to use it (at most 1024 characters)"),
        instructions: z.string().optional().describe("For save: the SKILL.md body in Markdown"),
        spec: z.record(z.any()).optional().describe("For save: capsulate/skill.json {kind?, apps?, environment?, frames?, inputs?, procedures?, checks?, traps?}"),
        files: z.array(fileSchema).optional().describe("For save: other files of the skill folder"),
        lessonId: z.string().optional().describe("For save: the lesson this skill was learned from"),
        note: z.string().optional().describe("For save or approve: what changed, or why"),
        state: z.enum(["draft", "proposed", "current"]).optional().describe("For save: the new version's state"),
        force: z.boolean().optional().describe("For save as current, or approve: skip the rehearsal (the owner's call)"),
        sessionId: z.string().optional().describe("For environment: the capsule to save as the skill's environment"),
        setup: z.string().optional().describe("For environment: the procedure a launch runs once the capsule is ACTIVE"),
        keep: z.boolean().optional().describe("For rehearse: keep the fresh capsule after the rehearsal"),
        on: z.boolean().optional().describe("For weekly: turn the weekly rehearsal on or off"),
      },
    },
    async (a) => {
      try {
        const need = (what: string) => {
          if (!a.skill) throw new Error(`${what} needs skill (its name)`);
          return a.skill;
        };
        switch (a.action) {
          case "list": {
            const list = await cap.skills.list({ q: a.query });
            if (!list.length) return ok(a.query ? `No skill matches "${a.query}".` : "The team has no skills yet.");
            return ok(
              list
                .map((k) => `${k.name} (${k.currentVersion ? `version ${k.currentVersion}` : "no current version"}, ${k.kind}${k.apps?.length ? `, ${k.apps.map((x) => [x.name, x.version].filter(Boolean).join(" ")).join(", ")}` : ""}): ${k.description}`)
                .join("\n"),
            );
          }
          case "get":
            return ok(describeSkill(await cap.skills.get(need("get"), { version: a.version }), a.part ?? "all"));
          case "save": {
            const d = await cap.skills.save({
              skillMd: a.skillMd,
              name: a.name,
              description: a.description,
              instructions: a.instructions,
              spec: a.spec as SkillSpec | undefined,
              files: a.files,
              note: a.note,
              state: a.state,
              force: a.force,
              ...(a.lessonId ? { source: "lesson" as const, sourceRef: a.lessonId } : {}),
            });
            const v = d.version!;
            const next =
              v.state === "current"
                ? "It is the version that runs."
                : `It is ${v.state}: the owner approves it (action 'approve', after a rehearsal, or with force).`;
            return ok(`Saved ${d.skill.name}, version ${v.version}. ${next}`);
          }
          case "versions": {
            const list = await cap.skills.versions(need("versions"));
            return ok(list.map((v) => `version ${v.version}: ${v.state}, from ${v.source}${v.rehearsal ? `, rehearsal ${v.rehearsal.status}` : ""}${v.note ? `: ${v.note}` : ""}`).join("\n") || "No versions.");
          }
          case "approve": {
            if (!a.version) throw new Error("approve needs version");
            const d = await cap.skills.approve(need("approve"), a.version, { force: a.force, note: a.note });
            return ok(`${d.skill.name}: version ${d.skill.currentVersion} is the one that runs now.`);
          }
          case "reject": {
            if (!a.version) throw new Error("reject needs version");
            await cap.skills.reject(need("reject"), a.version);
            return ok(`Rejected ${a.skill} version ${a.version}.`);
          }
          case "rollback": {
            if (!a.version) throw new Error("rollback needs version");
            const d = await cap.skills.rollback(need("rollback"), a.version);
            return ok(`${d.skill.name}: version ${d.skill.currentVersion} runs again.`);
          }
          case "environment": {
            if (!a.sessionId) throw new Error("environment needs sessionId (the capsule to save)");
            const r = await cap.skills.environment(need("environment"), {
              sessionId: a.sessionId,
              setup: a.setup,
              note: a.note,
              state: a.state,
              force: a.force,
            });
            const v = r.version;
            const next = v.state === "current" ? "It is the version that runs." : `It is ${v.state}: the owner approves it (action 'approve').`;
            return ok(`Saved the capsule as ${r.skill.name}'s environment (template ${r.snapshot.id}), version ${v.version}. ${next} Launch it with capsulate_launch skill '${r.skill.name}'.`);
          }
          case "rehearse": {
            if (!a.version) throw new Error("rehearse needs version");
            const run = await cap.skills.rehearse(need("rehearse"), a.version, { sessionId: a.sessionId, keep: a.keep });
            return ok(
              `Rehearsing ${a.skill} version ${a.version} (${run.runId}) ${a.sessionId ? `on ${a.sessionId}` : "in a fresh capsule from its environment"}. ` +
                `Follow it with capsulate_skill_run action 'get', runId '${run.runId}', waitMs 25000; when it passes, approve the version.`,
            );
          }
          case "weekly": {
            if (a.on === undefined) throw new Error("weekly needs on (true or false)");
            const d = await cap.skills.setWeekly(need("weekly"), a.on);
            return ok(d.skill.rehearseWeekly ? `${d.skill.name} is rehearsed every week.` : `${d.skill.name} is no longer rehearsed every week.`);
          }
          case "archive":
          case "unarchive": {
            await cap.skills.update(need(a.action), { status: a.action === "archive" ? "archived" : "active" });
            return ok(`${a.action === "archive" ? "Archived" : "Restored"} ${a.skill}.`);
          }
        }
      } catch (e) {
        return err(e);
      }
    },
  );
}

/** The run tool: a skill's procedure in the background, waiting for the model where run_actions would stop. */
export function registerRunTools(t: ToolKit) {
  const { server, cap, ok, err } = t;
  const stepSchema = z.object({ do: z.string() }).passthrough();
  server.registerTool(
    "capsulate_skill_run",
    {
      title: "Run a skill in the background",
      description: [
        "Run a skill's procedure (or steps that call its procedures) in the background, with no time limit: the stored steps replay and you are asked only where the skill leaves a decision open.",
        "action 'start' (sessionId, skill, procedure? default main, inputs?, steps?, frames?, version?; or launch: true to start the skill's environment for the run, keep? to keep it) starts it and waits up to waitMs (default 20000) for it to end or to need you.",
        "'get' (runId, waitMs?) reads it; 'continue' (runId with values answering its question, or action 'retry' or 'skip', or steps to run instead of a stuck step) goes on; 'cancel' (runId); 'list' (skill?, status?).",
        "A run that needs you says so: needs_input with a question, or needs_help with the step that failed. Steps you give for a stuck step are kept as a proposed fix to the skill.",
      ].join(" "),
      inputSchema: {
        action: z.enum(["start", "get", "continue", "cancel", "list"]),
        runId: z.string().optional(),
        sessionId: z.string().optional().describe("For start: the capsule to run on"),
        skill: z.string().optional().describe("For start or list: the skill's name"),
        procedure: z.string().optional().describe("For start: the procedure (default main)"),
        inputs: z.record(z.any()).optional().describe("For start: the skill's inputs"),
        steps: z.array(stepSchema).optional().describe("For start: steps instead of a procedure; for continue: steps to run instead of the stuck step"),
        frames: z.record(z.any()).optional().describe("For start: coordinate frames the steps may name"),
        version: z.number().int().positive().optional(),
        launch: z.boolean().optional().describe("For start: launch the skill's environment for the run"),
        keep: z.boolean().optional().describe("For start with launch: keep the capsule after the run"),
        values: z.record(z.any()).optional().describe("For continue: the answer to the run's question"),
        continueAction: z.enum(["retry", "skip"]).optional().describe("For continue: run the stuck step again, or go on without it"),
        note: z.string().optional(),
        status: z.string().optional().describe("For list: e.g. needs_input,needs_help"),
        waitMs: z.number().int().min(0).max(25000).optional().describe("How long to wait for the run to end or need you (default 20000 for start and continue)"),
      },
    },
    async (a) => {
      try {
        const need = (what: string) => {
          if (!a.runId) throw new Error(`${what} needs runId`);
          return a.runId;
        };
        const settle = async (runId: string, waitMs: number) => {
          if (waitMs <= 0) return cap.runs.get(runId);
          const deadline = Date.now() + waitMs;
          let r = await cap.runs.get(runId, { waitMs: Math.min(waitMs, 25000) });
          while (!["succeeded", "failed", "cancelled", "needs_input", "needs_help"].includes(r.status) && Date.now() < deadline) {
            r = await cap.runs.get(runId, { waitMs: Math.min(deadline - Date.now(), 25000) });
          }
          return r;
        };
        switch (a.action) {
          case "start": {
            const run = await cap.runs.start({
              sessionId: a.sessionId, skill: a.skill, procedure: a.procedure, inputs: a.inputs, steps: a.steps as never,
              frames: a.frames as never, version: a.version, launch: a.launch, keep: a.keep,
            });
            return ok(runText(await settle(run.runId, a.waitMs ?? 20000)));
          }
          case "get":
            return ok(runText(await settle(need("get"), a.waitMs ?? 0)));
          case "continue": {
            const id = need("continue");
            await cap.runs.continue(id, { values: a.values, steps: a.steps as never, action: a.continueAction, note: a.note });
            return ok(runText(await settle(id, a.waitMs ?? 20000)));
          }
          case "cancel":
            return ok(runText(await cap.runs.cancel(need("cancel"))));
          case "list": {
            const list = await cap.runs.list({ skill: a.skill, status: a.status });
            if (!list.length) return ok("No runs.");
            return ok(list.map((r) => `${r.runId}: ${r.status}${r.skillName ? `, ${r.skillName}${r.version ? ` v${r.version}` : ""}` : ""}, ${r.done} steps, ${r.createdAt}`).join("\n"));
          }
        }
      } catch (e) {
        return err(e);
      }
    },
  );
}

/** What an inbox item asks for, as the next tool call. */
function nextFor(it: InboxItem): string {
  switch (it.kind) {
    case "run_needs_input":
      return `answer it: capsulate_skill_run action 'continue', runId '${it.runId}', values`;
    case "run_needs_help":
      return `look at the screen, then capsulate_skill_run action 'continue', runId '${it.runId}', continueAction 'retry' or 'skip', or steps`;
    case "version_proposed":
      return `rehearse it (capsulate_skills action 'rehearse', skill '${it.skillName}', version ${it.version}), then approve it`;
    case "rehearsal_failed":
      return `read the run (capsulate_skill_run action 'get', runId '${it.runId}'), fix the skill and save a new version`;
    case "fingerprint_drift":
      return `relearn ${it.skillName} on the new software, or save a new environment`;
    default:
      return "";
  }
}

/** The inbox tool: what waits for someone in the team. */
export function registerInboxTool(t: ToolKit) {
  const { server, cap, ok, err } = t;
  server.registerTool(
    "capsulate_inbox",
    {
      title: "What waits for someone",
      description:
        "The team's inbox: runs that ask a question or are stuck on a step, versions waiting for approval, versions whose rehearsal failed, and skills whose software changed. Each item says what to do next.",
      inputSchema: {},
    },
    async () => {
      try {
        const items = await cap.inbox.list();
        if (!items.length) return ok("Nothing waits for anyone.");
        return ok(items.map((it) => `- ${it.title}${it.detail ? ` (${it.detail})` : ""}. Next: ${nextFor(it)}.`).join("\n"));
      } catch (e) {
        return err(e);
      }
    },
  );
}

/** A lesson in a line. */
function lessonLine(l: Lesson): string {
  const rec = l.artifacts.recorder === "none" ? " A person's clicks and keys are not recorded on this capsule." : "";
  return `Lesson ${l.lessonId} (${l.mode}, ${l.status}): "${l.title}" on ${l.sessionId}, ${l.eventCount} events, ${l.artifacts.frames} keyframes.${rec}`;
}

/** A digest as the model reads it: the steps in words with each step as it ran, the notes, what changed. */
export function digestText(d: LessonDigest): string {
  const lines = [lessonLine(d.lesson)];
  if (d.lesson.goal) lines.push(`Goal: ${d.lesson.goal}`);
  if (d.windows?.length) lines.push(`Windows: ${d.windows.join(", ")}`);
  lines.push("", "Steps (each with the step as it ran):");
  for (const s of d.steps) {
    lines.push(`${s.n}. [${s.actor}] ${s.says}${s.step ? `  ${JSON.stringify(s.step)}` : ""}`);
  }
  if (d.omitted) lines.push(`...and ${d.omitted} more steps.`);
  const notes = (d.notes ?? []).filter((n) => n.actor !== "system");
  if (notes.length) {
    lines.push("", "Notes:");
    for (const n of notes) lines.push(`- ${n.says}`);
  }
  if (d.voice?.length) {
    lines.push("", "What the teacher said:");
    for (const v of d.voice) lines.push(`- ${v.text}`);
  }
  const e = d.envDiff;
  if (e?.packages?.length) lines.push("", `Installed during the lesson: ${e.packages.join(", ")}`);
  if (e?.files?.length) lines.push(`Files changed: ${e.files.slice(0, 20).join(", ")}${e.files.length > 20 ? " ..." : ""}`);
  lines.push("", d.guide);
  return lines.join("\n");
}

/** The lesson tool: teach a skill on a capsule, then turn the lesson into a skill. */
export function registerLessonTool(t: ToolKit) {
  const { server, cap, ok, err } = t;
  server.registerTool(
    "capsulate_lesson",
    {
      title: "Lessons: learn a skill on a capsule",
      description: [
        "A lesson records how a job is done on a capsule so it can become a skill. While it records, every action taken on the capsule through these tools is logged in full, a person's clicks, keys and typing on the shared screen are recorded with the elements they hit (typing in a password field is masked), and keyframes are taken.",
        "action 'start' (sessionId, title, goal?, mode: 'ai' to teach yourself toward the goal, 'human' when a person teaches on the shared screen; skill? it improves); 'note' (lessonId, text, screenshot?) for what you learned or a trap; 'pause', 'resume', 'finish', 'discard' (lessonId);",
        "'get' (lessonId) reads the digest after it finished: the steps in plain words, each with the step that does it again, the notes and what changed on the capsule, then save the skill with capsulate_skills action 'save' and lessonId; 'draft' (lessonId, skill?, description?) makes a draft version mechanically; 'on' (sessionId) is the lesson recording on a capsule; 'list'.",
        "Never type a password or a key during a lesson: hand that step to the person (capsulate_handoff).",
      ].join(" "),
      inputSchema: {
        action: z.enum(["start", "note", "pause", "resume", "finish", "discard", "get", "draft", "on", "list"]),
        lessonId: z.string().optional(),
        sessionId: z.string().optional().describe("For start and on: the capsule the lesson happens on"),
        title: z.string().optional().describe("For start: what is taught, e.g. 'Export a PDF in LibreOffice'"),
        goal: z.string().optional().describe("For start: what the lesson should achieve"),
        mode: z.enum(["ai", "human"]).optional().describe("For start: ai (you explore toward the goal) or human (a person teaches)"),
        video: z.boolean().optional().describe("For start: record a video of the screen too (Linux capsules)"),
        voice: z.boolean().optional().describe("For start (human): the person may explain out loud in the console; their voice becomes text in the digest"),
        skill: z.string().optional().describe("For start: a skill this lesson improves; for draft: the skill to draft into or to create"),
        text: z.string().optional().describe("For note"),
        screenshot: z.boolean().optional().describe("For note: take a keyframe with it"),
        description: z.string().optional().describe("For draft into a new skill: what it does and when to use it"),
        status: z.string().optional().describe("For list"),
      },
    },
    async (a) => {
      try {
        const need = (what: string) => {
          if (!a.lessonId) throw new Error(`${what} needs lessonId`);
          return a.lessonId;
        };
        switch (a.action) {
          case "start": {
            if (!a.sessionId || !a.title) throw new Error("start needs sessionId and title");
            const l = await cap.lessons.start({ sessionId: a.sessionId, title: a.title, goal: a.goal, mode: a.mode ?? "ai", skillId: a.skill, video: a.video, voice: a.voice });
            const how =
              l.mode === "ai"
                ? "Explore toward the goal with the capsulate tools; add a note (action 'note') whenever you learn something or get past a trap; finish when the goal is reached."
                : "Share the console link (capsulate_console_link) so the person can teach on the shared screen: their clicks, keys and typing are recorded with the elements they hit. Add their explanations as notes; finish when they say they are done.";
            return ok(`${lessonLine(l)} It records now. ${how}`);
          }
          case "note": {
            if (!a.text) throw new Error("note needs text");
            const r = await cap.lessons.note(need("note"), a.text, { screenshot: a.screenshot });
            return ok(`Noted${r.frame ? ` (keyframe ${r.frame})` : ""}.`);
          }
          case "pause":
            return ok(lessonLine(await cap.lessons.pause(need("pause"))));
          case "resume":
            return ok(lessonLine(await cap.lessons.resume(need("resume"))));
          case "finish": {
            const l = await cap.lessons.finish(need("finish"));
            return ok(`${lessonLine(l)} Read its digest (action 'get') and save the skill.`);
          }
          case "discard":
            await cap.lessons.discard(need("discard"));
            return ok(`Discarded ${a.lessonId}.`);
          case "get": {
            const id = need("get");
            const l = await cap.lessons.get(id);
            if (l.status === "recording" || l.status === "paused") return ok(`${lessonLine(l)} Finish it to read its digest.`);
            return ok(digestText(await cap.lessons.digest(id)));
          }
          case "draft": {
            const d = await cap.lessons.draft(need("draft"), { skill: a.skill, description: a.description });
            return ok(`Drafted ${d.skill.name} version ${d.version?.version} (a draft). Read it with capsulate_skills action 'get' version ${d.version?.version}, improve it with 'save', then rehearse and approve it.`);
          }
          case "on": {
            if (!a.sessionId) throw new Error("on needs sessionId");
            const l = await cap.lessons.onCapsule(a.sessionId);
            return ok(l ? lessonLine(l) : `No lesson records on ${a.sessionId}.`);
          }
          case "list": {
            const list = await cap.lessons.list({ status: a.status });
            return ok(list.length ? list.map(lessonLine).join("\n") : "No lessons.");
          }
        }
      } catch (e) {
        return err(e);
      }
    },
  );
}
