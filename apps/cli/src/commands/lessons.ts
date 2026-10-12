// cap lesson — lessons (Phase SK): teaching sessions a skill is learned from.
//
//   cap lesson start <capsuleId> "Export a PDF" --goal "..." --mode ai
//   cap lesson note <lessonId> "The export hides under Advanced" --screenshot
//   cap lesson finish <lessonId>
//   cap lesson digest <lessonId>                 the lesson in plain words (--json for the AI)
//   cap lesson draft <lessonId> --skill pdf-export   a draft version from it
//   cap lesson on <capsuleId>                    the lesson recording on a capsule

import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import type { Lesson, LessonDigest } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { result, success, table } from "../output.js";

// What captured the person's input, in words.
const recorders: Record<string, string> = { xrecord: "the person's input recorded", llhook: "the person's input recorded", none: "the person's input not recorded" };

function lessonLine(l: Lesson): string {
  const secs = l.finishedAt ? Math.round((Date.parse(l.finishedAt) - Date.parse(l.startedAt) - (l.pausedMs ?? 0)) / 1000) : undefined;
  const rec = l.artifacts.recorder ? recorders[l.artifacts.recorder] : undefined;
  return (
    `${l.lessonId}  ${l.status}  ${l.mode}  "${l.title}"  on ${l.sessionId}  ${l.eventCount} events, ${l.artifacts.frames} keyframes` +
    (secs !== undefined ? `, ${secs} s` : "") +
    (rec ? `, ${rec}` : "") +
    (l.artifacts.draftSkill ? `\n  became ${l.artifacts.draftSkill} version ${l.artifacts.draftVersion}` : "")
  );
}

function digestText(d: LessonDigest): string {
  const lines = [lessonLine(d.lesson)];
  if (d.lesson.goal) lines.push(`Goal: ${d.lesson.goal}`);
  if (d.windows?.length) lines.push(`Windows: ${d.windows.join(", ")}`);
  lines.push("", "Steps:");
  for (const s of d.steps) lines.push(`  ${String(s.n).padStart(3)}. ${s.actor === "ai" ? "AI " : "    "}${s.says}${s.frame ? `  [frame ${s.frame}]` : ""}`);
  if (d.omitted) lines.push(`  ...and ${d.omitted} more`);
  const notes = (d.notes ?? []).filter((n) => n.actor !== "system");
  if (notes.length) {
    lines.push("", "Notes:");
    for (const n of notes) lines.push(`  - ${n.says}`);
  }
  if (d.voice?.length) {
    lines.push("", "Said:");
    for (const v of d.voice) lines.push(`  ${Math.floor(v.t / 60000)}:${String(Math.floor(v.t / 1000) % 60).padStart(2, "0")}  ${v.text}`);
  }
  const e = d.envDiff;
  if (e?.packages?.length) lines.push("", `Installed: ${e.packages.join(", ")}`);
  if (e?.files?.length) lines.push(`Files changed: ${e.files.length}`);
  return lines.join("\n");
}

export function registerLessons(program: Command): void {
  const lesson = program.command("lesson").description("Lessons: teach a skill on a capsule, then turn it into a skill");

  lesson
    .command("start <capsuleId> <title>")
    .description("Start a lesson on a capsule: the AI's actions through the API and a person's clicks and keys on its screen are logged until it finishes")
    .option("--goal <text>", "What the lesson should achieve")
    .option("--mode <mode>", "human (a person teaches, the default) or ai (the AI teaches itself)", "human")
    .option("--skill <name>", "A skill this lesson teaches or improves")
    .option("--video", "Record a video of the screen too (Linux capsules; a pause ends a part)")
    .option("--voice", "The teacher explains out loud: the console records the microphone and it becomes text")
    .option("--no-keyframes", "Take no screenshots at clicks and window changes")
    .action((sessionId: string, title: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ goal?: string; mode?: string; skill?: string; video?: boolean; voice?: boolean; keyframes?: boolean }>();
        if (o.mode !== "human" && o.mode !== "ai") throw new Error("--mode is human or ai");
        const l = await client.lessons.start({ sessionId, title, goal: o.goal, mode: o.mode, skillId: o.skill, video: o.video, voice: o.voice, noKeyframes: o.keyframes === false });
        result(l, (x: Lesson) => `Lesson ${x.lessonId} records on ${x.sessionId}. Finish it: cap lesson finish ${x.lessonId}`);
      }),
    );

  lesson
    .command("note <lessonId> <text>")
    .description("Add a note to a recording lesson")
    .option("--screenshot", "Take a keyframe with it")
    .action((id: string, text: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ screenshot?: boolean }>();
        const r = await client.lessons.note(id, text, { screenshot: o.screenshot });
        result(r, (x: { frame?: number }) => `Noted${x.frame ? ` (keyframe ${x.frame})` : ""}.`);
      }),
    );

  for (const [verb, desc] of [
    ["pause", "Pause a lesson (nothing is logged until it resumes)"],
    ["resume", "Resume a paused lesson"],
    ["finish", "Finish a lesson: its last events are saved and what changed on the capsule is noted"],
  ] as const) {
    lesson
      .command(`${verb} <lessonId>`)
      .description(desc)
      .action((id: string, _o, command: Command) =>
        withClient(command, async (client) => {
          const l = verb === "pause" ? await client.lessons.pause(id) : verb === "resume" ? await client.lessons.resume(id) : await client.lessons.finish(id);
          result(l, (x: Lesson) => lessonLine(x) + (verb === "finish" ? `\n  Read it: cap lesson digest ${x.lessonId}` : ""));
        }),
      );
  }

  lesson
    .command("discard <lessonId>")
    .description("Delete a lesson, its events and its keyframes")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.lessons.discard(id);
        success(`Discarded ${id}`);
      }),
    );

  lesson
    .command("get <lessonId>")
    .description("A lesson's state")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        result(await client.lessons.get(id), lessonLine);
      }),
    );

  lesson
    .command("on <capsuleId>")
    .description("The lesson recording (or paused) on a capsule, if one is")
    .action((sessionId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const l = await client.lessons.onCapsule(sessionId);
        result(l, (x: Lesson | null) => (x ? lessonLine(x) : `No lesson records on ${sessionId}.`));
      }),
    );

  lesson
    .command("digest <lessonId>")
    .description("The lesson in plain words: what the AI reads to write the skill (--json for all of it)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        result(await client.lessons.digest(id), digestText);
      }),
    );

  lesson
    .command("frame <lessonId> <n>")
    .description("Save a keyframe of a lesson")
    .requiredOption("-o, --out <file>", "Where to save the JPEG")
    .action((id: string, n: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ out: string }>();
        writeFileSync(o.out, await client.lessons.frame(id, parseInt(n, 10)));
        success(`Saved keyframe ${n} to ${o.out}`);
      }),
    );

  lesson
    .command("draft <lessonId>")
    .description("Make a draft version from a finished lesson: a new skill, or a new procedure of an existing one")
    .option("--skill <name>", "The skill (new or existing; default from the lesson's title)")
    .option("--description <text>", "For a new skill: what it does and when to use it")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ skill?: string; description?: string }>();
        const d = await client.lessons.draft(id, { skill: o.skill, description: o.description });
        result(d, (x: any) => `Drafted ${x.skill.name} version ${x.version?.version} (draft). Read it: cap skill get ${x.skill.name} --version ${x.version?.version}`);
      }),
    );

  lesson
    .command("list")
    .description("The team's lessons, newest first")
    .option("--status <status>", "recording, paused, ready...")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ status?: string }>();
        const list = await client.lessons.list({ status: o.status });
        result(list, (rows: Lesson[]) =>
          rows.length === 0
            ? "No lessons."
            : table(
                rows.map((l) => ({ lesson: l.lessonId, status: l.status, mode: l.mode, title: l.title, events: l.eventCount, started: String(l.startedAt).slice(0, 19).replace("T", " ") })),
                ["lesson", "status", "mode", "title", "events", "started"],
              ),
        );
      }),
    );
}
