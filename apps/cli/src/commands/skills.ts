// cap skill — the team's skill library (Phase SK, decision 56): learn once, repeat in minutes. A skill is an Agent
// Skills folder (SKILL.md) plus capsulate/skill.json (environment, procedures, checks, traps).
//
//   cap skill save ./krita-painting          create it, or add a proposed version when it exists
//   cap skill get krita-painting --md        the SKILL.md of the current version
//   cap skill approve krita-painting 3       make version 3 current (after a passing rehearsal, or --force)
//   cap skill export krita-painting -o k.zip

import type { Command } from "commander";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillDetail, SkillFileInput, SkillSpec } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { info, result, success, table } from "../output.js";
import { registerSkillRehearse, registerSkillRun } from "./runs.js";

/** Reads a skill folder: SKILL.md, capsulate/skill.json and every other file (dot files and node_modules skipped). */
async function readSkillDir(dir: string): Promise<{ skillMd: string; spec?: SkillSpec; files: SkillFileInput[] }> {
  const root = path.resolve(dir);
  const skillMd = await fs.readFile(path.join(root, "SKILL.md"), "utf-8").catch(() => {
    throw new Error(`${dir} has no SKILL.md (a skill folder holds SKILL.md and, for Capsulate, capsulate/skill.json)`);
  });
  let spec: SkillSpec | undefined;
  const specPath = path.join(root, "capsulate", "skill.json");
  try {
    spec = JSON.parse(await fs.readFile(specPath, "utf-8")) as SkillSpec;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`capsulate/skill.json: ${(err as Error).message}`);
  }
  const files: SkillFileInput[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const e of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else if (e.isFile() && r !== "SKILL.md" && r !== "capsulate/skill.json") {
        files.push({ path: r, contentB64: (await fs.readFile(path.join(root, r))).toString("base64") });
      }
    }
  };
  await walk("");
  return { skillMd, spec, files };
}

function versionLine(d: SkillDetail): string {
  const v = d.version;
  const k = d.skill;
  const state = v ? `version ${v.version} (${v.state})` : "no version";
  return `${k.name}: ${state}; current ${k.currentVersion ?? "none"}`;
}

export function registerSkills(program: Command): void {
  const skill = program.command("skill").description("Skills: what the AI learned, stored, tested and replayable");
  registerSkillRun(skill);
  registerSkillRehearse(skill);

  skill
    .command("list")
    .description("List the team's skills")
    .option("-q, --query <text>", "Match the name or the description")
    .option("--archived", "List archived skills instead")
    .action((_o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ query?: string; archived?: boolean }>();
        const list = await client.skills.list({ q: o.query, status: o.archived ? "archived" : "active" });
        result(list, (rows: any[]) =>
          table(
            rows.map((k) => ({
              name: k.name,
              kind: k.kind,
              current: k.currentVersion ?? "-",
              latest: k.latestVersion,
              runs: k.stats?.runs ?? 0,
              description: String(k.description).slice(0, 60),
            })),
            ["name", "kind", "current", "latest", "runs", "description"],
          ),
        );
      }),
    );

  skill
    .command("get <skill>")
    .description("Show a skill and its current version (or --version)")
    .option("--version <n>", "A version other than the current one", (v) => parseInt(v, 10))
    .option("--md", "Print only the SKILL.md")
    .option("--spec", "Print only capsulate/skill.json")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ version?: number; md?: boolean; spec?: boolean }>();
        const d = await client.skills.get(ref, { version: o.version });
        if (o.md) return result(d.version?.skillMd ?? "", (s: string) => s.trimEnd());
        if (o.spec) return result(d.version?.spec ?? {});
        result(d, (x: SkillDetail) => {
          const v = x.version;
          const procs = Object.entries(v?.spec?.procedures ?? {}).map(([name, p]) => {
            const params = Object.keys(p.params ?? {}).join(", ");
            return `  ${name}(${params}) - ${p.steps.length} steps${p.description ? `: ${p.description}` : ""}`;
          });
          const traps = (v?.spec?.traps ?? []).map((t) => `  - ${t.title}${t.fix ? ` (fix: ${t.fix})` : ""}`);
          return [
            `${x.skill.name} (${x.skill.kind}, ${x.skill.status})`,
            `  ${x.skill.description}`,
            `  ${versionLine(x)}; latest ${x.skill.latestVersion}`,
            procs.length ? `Procedures:\n${procs.join("\n")}` : "Procedures: none",
            traps.length ? `Traps:\n${traps.join("\n")}` : "",
            v?.files?.length ? `Files: ${v.files.map((f) => f.path).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        });
      }),
    );

  skill
    .command("save <dir>")
    .description("Save a skill folder: create the skill, or add a proposed version when the team has one by that name")
    .option("--state <state>", "draft | proposed | current")
    .option("--force", "Make it current without a passing rehearsal")
    .option("--note <text>", "What changed")
    .action((dir: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ state?: "draft" | "proposed" | "current"; force?: boolean; note?: string }>();
        const folder = await readSkillDir(dir);
        const d = await client.skills.save({ ...folder, state: o.state, force: o.force, note: o.note });
        result(d, (x: SkillDetail) => `✓ ${versionLine(x)}`);
      }),
    );

  skill
    .command("versions <skill>")
    .description("List a skill's versions, newest first")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const list = await client.skills.versions(ref);
        result(list, (rows: any[]) =>
          table(
            rows.map((v) => ({
              version: v.version,
              state: v.state,
              source: v.source,
              rehearsal: v.rehearsal?.status ?? "-",
              created: String(v.createdAt).slice(0, 19),
              note: String(v.note ?? "").slice(0, 50),
            })),
            ["version", "state", "source", "rehearsal", "created", "note"],
          ),
        );
      }),
    );

  skill
    .command("approve <skill> <version>")
    .description("Make a version current (it needs a passing rehearsal, or --force)")
    .option("--force", "Skip the rehearsal")
    .option("--note <text>", "Why")
    .action((ref: string, version: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ force?: boolean; note?: string }>();
        const d = await client.skills.approve(ref, parseInt(version, 10), { force: o.force, note: o.note });
        result(d, (x: SkillDetail) => `✓ ${x.skill.name}: version ${x.skill.currentVersion} is current`);
      }),
    );

  skill
    .command("reject <skill> <version>")
    .description("Reject a draft or proposed version")
    .action((ref: string, version: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.skills.reject(ref, parseInt(version, 10));
        success(`Rejected ${ref} version ${version}`);
      }),
    );

  skill
    .command("rollback <skill> <version>")
    .description("Make an earlier version current again")
    .action((ref: string, version: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const d = await client.skills.rollback(ref, parseInt(version, 10));
        result(d, (x: SkillDetail) => `✓ ${x.skill.name}: version ${x.skill.currentVersion} is current again`);
      }),
    );

  skill
    .command("environment <skill> <capsuleId>")
    .description("Save a capsule as the skill's environment: a saved template, and a version that launches from it")
    .option("--setup <procedure>", 'The procedure a launch runs once the capsule is ACTIVE ("" removes it)')
    .option("--size <size>", "The size a launch uses (default the capsule's)")
    .option("--note <text>", "What changed")
    .option("--current", "Make the new version current (with --force while another version is current)")
    .option("--force", "Replace the current version without a rehearsal")
    .action((ref: string, sessionId: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ setup?: string; size?: string; note?: string; current?: boolean; force?: boolean }>();
        const r = await client.skills.environment(ref, {
          sessionId,
          setup: o.setup,
          size: o.size,
          note: o.note,
          state: o.current ? "current" : undefined,
          force: o.force,
        });
        result(
          r,
          (x: any) =>
            `✓ ${x.skill.name}: version ${x.version.version} (${x.version.state}) launches from template ${x.snapshot.id}` +
            (x.version.state === "current" ? "" : `\n  approve it: cap skill approve ${x.skill.name} ${x.version.version}`),
        );
      }),
    );

  skill
    .command("archive <skill>")
    .description("Archive a skill (it stays, but is not offered to the AI)")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.skills.update(ref, { status: "archived" });
        success(`Archived ${ref}`);
      }),
    );

  skill
    .command("unarchive <skill>")
    .description("Bring an archived skill back")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.skills.update(ref, { status: "active" });
        success(`Restored ${ref}`);
      }),
    );

  skill
    .command("delete <skill>")
    .description("Delete a skill and every version of it")
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.skills.delete(ref);
        success(`Deleted ${ref}`);
      }),
    );

  skill
    .command("export <skill>")
    .description("Download the skill folder as a zip (Agent Skills layout)")
    .option("-o, --out <file>", "Where to write the zip (default <name>.zip)")
    .option("--version <n>", "A version other than the current one", (v) => parseInt(v, 10))
    .action((ref: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ out?: string; version?: number }>();
        const bytes = await client.skills.export(ref, { version: o.version });
        const out = o.out ?? `${ref}.zip`;
        await fs.writeFile(out, bytes);
        result({ file: out, bytes: bytes.length }, () => `✓ Wrote ${out} (${bytes.length} bytes)`);
      }),
    );

  skill
    .command("import <path>")
    .description("Import a skill from a zip or a folder (a skill of the same name gets a proposed version)")
    .option("--state <state>", "draft | proposed | current")
    .option("--force", "Make it current without a passing rehearsal")
    .action((p: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ state?: "draft" | "proposed" | "current"; force?: boolean }>();
        const stat = await fs.stat(p);
        const d = stat.isDirectory()
          ? await client.skills.import({ ...(await readSkillDir(p)), state: o.state, force: o.force })
          : await client.skills.import({ zip: new Uint8Array(await fs.readFile(p)), state: o.state, force: o.force });
        result(d, (x: SkillDetail) => `✓ ${versionLine(x)}`);
        if (d.version?.state === "proposed") info(`  Approve it with: cap skill approve ${d.skill.name} ${d.version.version}`);
      }),
    );
}
