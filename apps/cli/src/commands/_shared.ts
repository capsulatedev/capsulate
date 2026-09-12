import type { Command } from "commander";
import type { Capsulate } from "@capsulate/sdk";
import { resolveClient, type GlobalOpts } from "../client.js";
import { setJsonMode, fail } from "../output.js";

/** Merge global + local options for a (sub)command. */
export function gopts(command: Command): GlobalOpts {
  return command.optsWithGlobals() as GlobalOpts;
}

/**
 * Run a command body with a resolved client, honoring --json and turning any
 * thrown error into a clean non-zero exit. Use for everything that hits the API.
 */
export async function withClient(
  command: Command,
  fn: (client: Capsulate, opts: GlobalOpts) => Promise<void>,
): Promise<void> {
  const g = gopts(command);
  setJsonMode(Boolean(g.json));
  try {
    const { client } = await resolveClient(g);
    await fn(client, g);
  } catch (err) {
    fail(err);
  }
}

/** Parse repeated KEY=VALUE arguments into an object. */
export function parseKeyVals(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pairs) {
    const idx = p.indexOf("=");
    if (idx === -1) throw new Error(`Expected KEY=VALUE, got "${p}"`);
    out[p.slice(0, idx)] = p.slice(idx + 1);
  }
  return out;
}
