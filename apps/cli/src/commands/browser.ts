import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import type { BrowserSnapshot } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { success, out, isJsonMode } from "../output.js";

// LCU M2 — the browser fast path from the shell: the agent's own Chrome in a desktop capsule.
//   cap browser <id> open '{"url":"https://example.com"}'
//   cap browser <id> snapshot '{"interactive":true}'
//   cap browser <id> click '{"ref":"e12"}'
//   cap browser <id> screenshot -o page.jpg

const VERBS = ["open", "navigate", "tabs", "snapshot", "click", "fill", "select", "press", "scroll", "wait", "text", "eval", "screenshot"];

function outline(s: BrowserSnapshot): string {
  const lines = [`${s.title || "(untitled)"} | ${s.url}`];
  for (const it of s.items) {
    let l = `[${it.ref}] ${it.role}${it.level ? ` h${it.level}` : ""} ${JSON.stringify(it.name ?? "")}`;
    if (it.value) l += ` value=${JSON.stringify(it.value)}`;
    if (it.checked !== undefined) l += it.checked ? " checked" : " unchecked";
    if (it.disabled) l += " disabled";
    lines.push(l);
  }
  if (s.truncated) lines.push("... more elements");
  return lines.join("\n");
}

export function registerBrowser(program: Command): void {
  program
    .command("browser <id> <verb> [fields]")
    .description(`Drive the capsule's browser at page speed (${VERBS.join(", ")}); fields are the verb's JSON`)
    .option("-o, --out <file>", "screenshot: save the image to this file")
    .action((id: string, verb: string, fields: string | undefined, _o, command: Command) =>
      withClient(command, async (client) => {
        if (!VERBS.includes(verb)) throw new Error(`unknown browser verb ${verb}; one of ${VERBS.join(", ")}`);
        let body: Record<string, unknown> = {};
        if (fields) {
          try {
            body = JSON.parse(fields);
          } catch {
            throw new Error(`fields must be JSON, e.g. '{"ref":"e12"}'`);
          }
        }
        const local = command.opts<{ out?: string }>();
        const r = await client.capsules.browser(id).run<Record<string, any>>(verb, body);
        if (verb === "screenshot" && local.out) {
          writeFileSync(local.out, Buffer.from(String(r.base64 ?? ""), "base64"));
          success(`Saved the page screenshot to ${local.out}`);
          return;
        }
        if (verb === "snapshot" && !isJsonMode()) {
          process.stdout.write(outline(r as unknown as BrowserSnapshot) + "\n");
          return;
        }
        out(r);
      }),
    );
}
