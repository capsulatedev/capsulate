// Learn once, repeat in minutes: the krita-painting skill.
//
//   npm install
//   export CAPSULATE_API_KEY="cap_live_..."
//   npm start                    # import the skill, rehearse it, paint the lighthouse, download it
//   npm start -- --main          # paint the skill's own sunset instead (its main procedure)
//   npm start -- --no-rehearse   # skip the rehearsal (the team's current version runs)
//
// 1. The skill folder next to this file (krita-painting/: SKILL.md, capsulate/skill.json, references/) goes to your
//    team's library: a new skill, a new version of it, or nothing when the team's current version is the same.
// 2. A rehearsal proves the version on a fresh capsule: the skill's setup installs and starts Krita, then its checks
//    run (the canvas where the frame says, a fill and a stroke where they should land, the sunset exported). A new
//    version that passes is approved, so runs use it.
// 3. A run paints a new picture from the skill's procedures (src/lighthouse.ts: 114 calls, no coordinates of Krita's
//    buttons anywhere) on a capsule launched for the skill. The PNG lands in out/, and the capsule is destroyed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Capsulate, CapsulateError, type Run } from "@capsulate/sdk";
import { lighthouse } from "./lighthouse.js";

const apiKey = process.env.CAPSULATE_API_KEY;
if (!apiKey) {
  console.error("Set CAPSULATE_API_KEY first (dashboard: Settings, API and Keys).");
  process.exit(1);
}
const args = new Set(process.argv.slice(2));
const cap = new Capsulate({ apiKey, userAgent: "example-skill-krita-painting/1.0" });
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(here, "..", "krita-painting");
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

// JSON with its keys sorted, so a stored spec compares with the file's by content.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// Prints a run's progress on one line while it works.
function progress(label: string) {
  return (run: Run) => process.stdout.write(`\r  ${label}: ${run.status}, ${run.done} steps, ${secs(run.workMs)}   `);
}

// ---- 1. the skill in the team's library ----

const skillMd = fs.readFileSync(path.join(folder, "SKILL.md"), "utf8");
const spec = JSON.parse(fs.readFileSync(path.join(folder, "capsulate", "skill.json"), "utf8"));
const files = fs.readdirSync(path.join(folder, "references")).map((name) => ({
  path: `references/${name}`,
  content: fs.readFileSync(path.join(folder, "references", name), "utf8"),
}));

let name = "krita-painting";
let version: number;
let isNew = true;
const current = await cap.skills.get(name).catch((err) => {
  if (err instanceof CapsulateError && err.status === 404) return undefined;
  throw err;
});
if (current?.version && current.version.skillMd.trim() === skillMd.trim() && canonical(current.version.spec) === canonical(spec)) {
  version = current.version.version;
  isNew = false;
  console.log(`1. The team's current ${name} is this one: version ${version}.`);
} else {
  const imported = await cap.skills.import({ skillMd, spec, files, note: "From examples/skill-krita-painting" });
  name = imported.skill.name;
  version = imported.version!.version;
  console.log(`1. Imported ${name} as version ${version} (${imported.version!.state}).`);
}

// ---- 2. the rehearsal ----

if (!args.has("--no-rehearse")) {
  const t0 = Date.now();
  let r = await cap.skills.rehearse(name, version);
  r = await cap.runs.wait(r.runId, { timeoutMs: 20 * 60_000, onProgress: progress("rehearsal") });
  console.log(`\n2. Rehearsal ${r.status === "succeeded" ? "passed" : "FAILED"} in ${secs(Date.now() - t0)} (a fresh capsule, the setup, the checks):`);
  for (const c of [...(r.outcome?.fingerprint ?? []), ...(r.outcome?.checks ?? [])]) {
    console.log(`   ${c.ok ? "ok  " : "FAIL"} ${c.name}${c.ok ? "" : `: ${c.error}`}`);
  }
  if (r.status !== "succeeded") process.exit(1);
  const detail = await cap.skills.get(name, { version });
  if (detail.version?.state !== "current") {
    await cap.skills.approve(name, version, { note: "Rehearsal passed" });
    console.log(`   Approved version ${version}.`);
  }
} else if (isNew) {
  console.log("2. Skipped the rehearsal: runs use the team's current version.");
}

// ---- 3. a new painting from the skill ----

const file = args.has("--main") ? "sunset.png" : "lighthouse.png";
const t0 = Date.now();
let run = await cap.runs.start({
  skill: name,
  ...(args.has("--main") ? { procedure: "main", inputs: { file } } : { steps: lighthouse(file) }),
  launch: true,
  keep: true,
  label: args.has("--main") ? "the sunset" : "a lighthouse at dusk",
});
let sessionId = run.sessionId;
const show = progress("painting");
try {
  run = await cap.runs.wait(run.runId, {
    timeoutMs: 30 * 60_000,
    onProgress: (r) => {
      sessionId = r.sessionId ?? sessionId;
      show(r);
    },
  });
  sessionId = run.sessionId ?? sessionId;
  console.log(`\n3. The run ${run.status} in ${secs(Date.now() - t0)}: ${run.done} steps replayed from the skill, ${secs(run.workMs)} of work.`);
  if (run.status !== "succeeded") {
    // A run that waits (a step failed, a person holds the screen) would hold the capsule: say why, then cancel it.
    const w = run.waiting;
    console.error(`   ${w ? `${w.reason} at ${w.where ?? "a step"}: ${w.error ?? w.question ?? ""}` : run.error ?? "see the run in the dashboard: Skills, Runs"}`);
    if (w) await cap.runs.cancel(run.runId).catch(() => {});
    process.exitCode = 1;
  } else {
    const capsule = await cap.capsules.get(sessionId!);
    const png = await capsule.readFile(`/home/capsulate/Pictures/${file}`, 8 << 20);
    const out = path.join(here, "..", "out");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, file), Buffer.from(png.contentB64, "base64"));
    console.log(`   Saved out/${file}.`);
  }
} finally {
  if (sessionId) {
    await (await cap.capsules.get(sessionId)).destroy().catch(() => {});
    console.log(`   Destroyed ${sessionId}.`);
  }
}
