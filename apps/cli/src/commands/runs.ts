// Runs (Phase SK): a skill's procedure in the background, waiting for you where run_actions would stop.
//
//   cap skill run krita-painting --capsule <id> --input subject="a cat" --wait
//   cap runs list --skill krita-painting
//   cap runs answer <runId> hex=#6f8b85          answer a run's question
//   cap runs retry <runId> | skip <runId> | fix <runId> @steps.json
//   cap runs wait <runId> | get <runId> | cancel <runId>
//
// `cap run` (without the s) runs code on a capsule; these are runs of skills.

import type { Command } from "commander";
import { readFileSync } from "node:fs";
import type { Capsulate, InboxItem, Run, RunStep } from "@capsulate/sdk";
import { withClient, parseKeyVals } from "./_shared.js";
import { exitWith, info, result, table } from "../output.js";

/** A run in a few lines: where it is, and what it needs when it waits. */
export function describeRun(r: Run): string {
  const lines = [
    `${r.runId}  ${r.status}${r.skillName ? `  ${r.skillName}${r.version ? ` v${r.version}` : ""}${r.procedure ? `:${r.procedure}` : ""}` : ""}` +
      `  ${r.done} steps (${r.replayed} replayed, ${r.asked} asked, ${r.fixed} fixed)  ${(r.workMs / 1000).toFixed(1)} s`,
  ];
  const w = r.waiting;
  if (w?.reason === "ask") {
    lines.push(`  It asks: ${w.question}`);
    if (w.options?.length) lines.push(`  Options: ${w.options.join(", ")}`);
    lines.push(`  Answer: cap runs answer ${r.runId} ${(w.gives ?? ["value"]).map((g) => `${g}=...`).join(" ")}`);
  } else if (w) {
    lines.push(`  Stuck at ${w.where ?? "a step"}${w.step ? ` (${w.step.do})` : ""}: ${w.error ?? w.reason}`);
    lines.push(`  Then: cap runs retry ${r.runId} | cap runs skip ${r.runId} | cap runs fix ${r.runId} @steps.json`);
  }
  if (r.error) lines.push(`  ${r.error}`);
  if (r.outcome?.proposedVersion) lines.push(`  The fixes are proposed as version ${r.outcome.proposedVersion}: cap skill versions ${r.skillName}`);
  return lines.join("\n");
}

function stepLine(s: NonNullable<Run["steps"]>[number]): string {
  return `  ${String(s.seq).padStart(4)}. ${(s.where ? `${s.where} ` : "").padEnd(28)}${s.do.padEnd(14)} ${s.kind.padEnd(9)} ${String(s.ms).padStart(5)} ms${s.ok ? "" : `  ${s.error ?? ""}`}`;
}

/** Follows a run until it ends or needs you, printing its steps as they run. Exits 2 when it waits, 1 when it failed. */
async function follow(client: Capsulate, runId: string, quiet: boolean): Promise<Run> {
  const r = await client.runs.wait(runId, {
    onProgress: (x) => {
      if (!quiet) for (const s of x.steps ?? []) info(stepLine(s));
    },
  });
  return r;
}

function exitFor(r: Run): void {
  if (r.status === "needs_input" || r.status === "needs_help") exitWith(2);
  if (r.status === "failed" || r.status === "cancelled") exitWith(1);
}

function readStepsArg(arg: string): RunStep[] {
  const raw = arg === "-" ? readFileSync(0, "utf8") : arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
  const v = JSON.parse(raw);
  const steps = Array.isArray(v) ? v : v?.steps;
  if (!Array.isArray(steps)) throw new Error(`steps must be a JSON list of {"do": verb, ...fields}`);
  return steps as RunStep[];
}

/** cap skill run <skill> ... (registered under `cap skill`). */
export function registerSkillRun(skill: Command): void {
  skill
    .command("run <skill>")
    .description("Run a skill's procedure in the background on a capsule (or a new one with --launch)")
    .option("--capsule <id>", "The capsule to run on")
    .option("--launch", "Launch the skill's environment for the run (destroyed after, unless --keep)")
    .option("--keep", "Keep the launched capsule after the run")
    .option("--procedure <name>", "The procedure (default main)")
    .option("--skill-version <n>", "The skill version (default the current one)")
    .option("-i, --input <KEY=VALUE...>", "The skill's inputs (a JSON value or text)")
    .option("--steps <json>", "Steps to run instead of a procedure (JSON list, @file or - for stdin)")
    .option("-w, --wait", "Follow the run until it ends or needs you (exit 2 when it waits)")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ capsule?: string; launch?: boolean; keep?: boolean; procedure?: string; skillVersion?: string; input?: string[]; steps?: string; wait?: boolean }>();
        if (!o.capsule && !o.launch) throw new Error("Give --capsule <id>, or --launch to start the skill's environment.");
        const inputs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parseKeyVals(o.input ?? []))) {
          try {
            inputs[k] = JSON.parse(v);
          } catch {
            inputs[k] = v;
          }
        }
        const run = await client.runs.start({
          sessionId: o.capsule,
          launch: o.launch,
          keep: o.keep,
          skill: ref,
          procedure: o.procedure,
          version: o.skillVersion ? parseInt(o.skillVersion, 10) : undefined,
          inputs: Object.keys(inputs).length ? inputs : undefined,
          steps: o.steps ? (readStepsArg(o.steps) as never) : undefined,
        });
        if (!o.wait) {
          result(run, (r: Run) => `Started ${r.runId}. Follow it: cap runs wait ${r.runId}`);
          return;
        }
        const r = await follow(client, run.runId, false);
        result(r, describeRun);
        exitFor(r);
      }),
    );
}

/** cap skill rehearse and cap skill weekly (registered under `cap skill`). */
export function registerSkillRehearse(skill: Command): void {
  skill
    .command("rehearse <skill> <version>")
    .description("Rehearse a version in a fresh capsule from its environment (or --capsule): its fingerprint and checks")
    .option("--capsule <id>", "Rehearse on this capsule instead of a fresh one")
    .option("--keep", "Keep the fresh capsule after the rehearsal")
    .option("-w, --wait", "Follow the rehearsal until it ends (exit 1 when it fails)")
    .action((ref: string, version: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ capsule?: string; keep?: boolean; wait?: boolean }>();
        const run = await client.skills.rehearse(ref, parseInt(version, 10), { sessionId: o.capsule, keep: o.keep });
        if (!o.wait) {
          result(run, (r: Run) => `Rehearsing ${ref} version ${version}: ${r.runId}. Follow it: cap runs wait ${r.runId}`);
          return;
        }
        const r = await follow(client, run.runId, false);
        result(r, (x: Run) => {
          const lines = [describeRun(x)];
          for (const c of [...(x.outcome?.fingerprint ?? []), ...(x.outcome?.checks ?? [])]) {
            lines.push(`  ${c.ok ? "passed" : "FAILED"}  ${c.name}${c.ok ? "" : `: ${c.error ?? ""}`}`);
          }
          if (x.status === "succeeded") lines.push(`  Approve it: cap skill approve ${ref} ${version}`);
          return lines.join("\n");
        });
        exitFor(r);
      }),
    );

  skill
    .command("weekly <skill> <onOrOff>")
    .description("Rehearse the current version every week, as you, to notice when the software changes")
    .action((ref: string, onOrOff: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (onOrOff !== "on" && onOrOff !== "off") throw new Error("Say on or off.");
        const d = await client.skills.setWeekly(ref, onOrOff === "on");
        result(d, () => (d.skill.rehearseWeekly ? `${ref} is rehearsed every week.` : `${ref} is no longer rehearsed every week.`));
      }),
    );
}

export function registerInbox(program: Command): void {
  program
    .command("inbox")
    .description("What waits for someone in the team: runs that ask or are stuck, versions to approve, failed rehearsals, changed software")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const items = await client.inbox.list();
        result(items, (rows: InboxItem[]) =>
          rows.length === 0
            ? "Nothing waits for you."
            : rows
                .map((it) => {
                  const next =
                    it.kind === "run_needs_input" || it.kind === "run_needs_help"
                      ? `cap runs get ${it.runId}`
                      : it.kind === "version_proposed" || it.kind === "rehearsal_failed"
                        ? `cap skill versions ${it.skillName}`
                        : `cap skill get ${it.skillName}`;
                  return `${it.title}${it.detail ? `\n    ${it.detail}` : ""}\n    ${next}`;
                })
                .join("\n"),
        );
      }),
    );
}

export function registerRuns(program: Command): void {
  const runs = program.command("runs").description("Runs of skills: follow them, answer them, unstick them");

  runs
    .command("list")
    .description("The team's runs, newest first")
    .option("--skill <name>", "Only this skill's")
    .option("--capsule <id>", "Only this capsule's")
    .option("--status <status>", "Only runs in this status (needs_input,needs_help for the ones waiting for you)")
    .option("--limit <n>", "At most this many")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ skill?: string; capsule?: string; status?: string; limit?: string }>();
        const list = await client.runs.list({ skill: o.skill, sessionId: o.capsule, status: o.status, limit: o.limit ? parseInt(o.limit, 10) : undefined });
        result(list, (rows: Run[]) =>
          rows.length === 0
            ? "No runs."
            : table(
                rows.map((r) => ({
                  run: r.runId,
                  status: r.status,
                  skill: r.skillName ? `${r.skillName}${r.version ? ` v${r.version}` : ""}` : "",
                  steps: r.done,
                  work: `${(r.workMs / 1000).toFixed(1)} s`,
                  started: String(r.createdAt).slice(0, 19).replace("T", " "),
                })),
                ["run", "status", "skill", "steps", "work", "started"],
              ),
        );
      }),
    );

  runs
    .command("get <runId>")
    .description("A run and its steps")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.runs.get(id);
        result(r, (x: Run) => [describeRun(x), ...(x.steps ?? []).slice(-30).map(stepLine)].join("\n"));
      }),
    );

  runs
    .command("wait <runId>")
    .description("Follow a run until it ends or needs you (exit 2 when it waits, 1 when it failed)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await follow(client, id, false);
        result(r, describeRun);
        exitFor(r);
      }),
    );

  runs
    .command("answer <runId> <values...>")
    .description("Answer a run's question: KEY=VALUE for each value it asks for")
    .option("-w, --wait", "Then follow the run")
    .action((id: string, values: string[], _o, command: Command) =>
      withClient(command, async (client) => {
        const parsed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parseKeyVals(values))) {
          try {
            parsed[k] = JSON.parse(v);
          } catch {
            parsed[k] = v;
          }
        }
        await client.runs.answer(id, parsed);
        await afterContinue(client, id, command);
      }),
    );

  for (const [name, desc] of [
    ["retry", "Run the stuck step again"],
    ["skip", "Go on without the stuck step"],
  ] as const) {
    runs
      .command(`${name} <runId>`)
      .description(desc)
      .option("-w, --wait", "Then follow the run")
      .action((id: string, _o, command: Command) =>
        withClient(command, async (client) => {
          if (name === "retry") await client.runs.retry(id);
          else await client.runs.skip(id);
          await afterContinue(client, id, command);
        }),
      );
  }

  runs
    .command("fix <runId> <steps>")
    .description("Run these steps instead of the stuck one (JSON list, @file or -); they become a proposed version of the skill")
    .option("--note <text>", "What was wrong")
    .option("-w, --wait", "Then follow the run")
    .action((id: string, stepsArg: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ note?: string }>();
        await client.runs.fix(id, readStepsArg(stepsArg), o.note);
        await afterContinue(client, id, command);
      }),
    );

  runs
    .command("cancel <runId>")
    .description("Stop a run")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const r = await client.runs.cancel(id);
        result(r, describeRun);
      }),
    );
}

async function afterContinue(client: Capsulate, id: string, command: Command): Promise<void> {
  const o = command.opts<{ wait?: boolean }>();
  if (!o.wait) {
    result({ runId: id, continued: true }, () => `Continued ${id}. Follow it: cap runs wait ${id}`);
    return;
  }
  const r = await follow(client, id, false);
  result(r, describeRun);
  exitFor(r);
}
