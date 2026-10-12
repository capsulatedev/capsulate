import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import type { RunActionsResult, RunFrame, RunObserve, RunStep } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { result, success, exitWith } from "../output.js";

// LCU M2.4 — several computer-use steps in one call, from the shell:
//   cap actions <id> '[{"do":"click_element","selector":{"name":"Save"}},{"do":"type","text":"notes"}]'
//   cap actions <id> @steps.json --observe screenshot -o after.png
//   cat steps.json | cap actions <id> -
// The steps run back to back on the server; the run stops at the first that fails (exit code 1).

const OBSERVE = ["none", "screenshot", "ui_tree", "browser_snapshot"];

function readSteps(arg: string): RunStep[] {
  const raw = arg === "-" ? readFileSync(0, "utf8") : arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error(`steps must be JSON: a list of {"do": verb, ...fields}, or {"steps": [...]}`);
  }
  const steps = Array.isArray(v) ? v : (v as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) throw new Error(`steps must be a JSON list of {"do": verb, ...fields}`);
  return steps as RunStep[];
}

function human(r: RunActionsResult): string {
  const lines = [
    r.ok
      ? `Ran ${r.completed} of ${r.total} steps in ${(r.ms / 1000).toFixed(1)} s`
      : `Stopped at step ${(r.stoppedAt ?? 0) + 1} of ${r.total} (${r.stopReason}) after ${r.completed} ok in ${(r.ms / 1000).toFixed(1)} s`,
  ];
  for (const s of r.steps) {
    const exp = s.expect ? `  expect ${s.expect.ok ? "met" : "not met"}` : "";
    lines.push(`  ${String(s.i + 1).padStart(2)}. ${s.do.padEnd(18)} ${s.ok ? "ok    " : "FAILED"} ${String(s.ms).padStart(5)} ms${exp}${s.ok ? "" : `  ${s.error ?? ""}`}`);
  }
  if (r.observation) lines.push(`  look: ${r.observation.do} ${r.observation.ok ? "ok" : `FAILED ${r.observation.error ?? ""}`}`);
  if (r.variables && Object.keys(r.variables).length) lines.push(`  saved: ${JSON.stringify(r.variables)}`);
  return lines.join("\n");
}

export function registerActions(program: Command): void {
  program
    .command("actions <id> <steps>")
    .description("Run several computer-use steps in one call (JSON list, @file or - for stdin); stops at the first failure")
    .option("--observe <what>", `a look at the end: ${OBSERVE.join(", ")}`)
    .option("-o, --out <file>", "save the observe screenshot to this file")
    .option("--skill <name>", "the skill `use` steps call when they name none")
    .option("--frames <json>", 'coordinate frames the steps may name: {"canvas":{"origin":[x,y],"scale":s}} (JSON or @file)')
    .action((id: string, stepsArg: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const local = command.opts<{ observe?: string; out?: string; skill?: string; frames?: string }>();
        if (local.observe && !OBSERVE.includes(local.observe)) throw new Error(`--observe must be one of ${OBSERVE.join(", ")}`);
        let frames: Record<string, RunFrame> | undefined;
        if (local.frames) {
          try {
            frames = JSON.parse(local.frames.startsWith("@") ? readFileSync(local.frames.slice(1), "utf8") : local.frames);
          } catch {
            throw new Error('--frames must be JSON: {"name": {"origin": [x, y], "scale": s, "clamp": [[x0, y0], [x1, y1]]}}');
          }
        }
        const r = await client.capsules.runActions(id, readSteps(stepsArg), {
          observe: local.observe as RunObserve | undefined,
          skill: local.skill,
          frames,
        });
        if (local.out && r.observation?.ok) {
          const o = r.observation.result as { imageB64?: string; result?: { base64?: string } } | undefined;
          const b64 = o?.imageB64 ?? o?.result?.base64;
          if (b64) {
            writeFileSync(local.out, Buffer.from(b64, "base64"));
            success(`Saved the screenshot to ${local.out}`);
          }
        }
        result(r, human);
        if (!r.ok) exitWith(1);
      }),
    );
}
