import type { Command } from "commander";
import type { ControlStatus } from "@capsulate/sdk";
import { withClient } from "./_shared.js";
import { result, info } from "../output.js";
import { openUrl } from "../browser.js";

// Phase LCU — live computer use from the terminal: open the live screen, see and change who is driving,
// hand the screen to a person and wait for it back, and narrate.
//
//   cap live <id>                 open the live screen in your browser (control link, 4 h)
//   cap live <id> --view --ttl 30 a 30 minute watch-only link, printed (add --open to open it)
//   cap live revoke <id>          end every live link of the capsule
//   cap control <id>              who is driving
//   cap control take <id>         hold the screen (the AI waits)
//   cap control release <id>      hand it back, optionally with --note
//   cap control wait <id>         wait until a person hands the screen back
//   cap handoff <id> "Please sign in, then hand it back"
//   cap say <id> "Opening the settings"

function describe(c: ControlStatus): string {
  const who =
    c.state === "agent"
      ? "the AI is driving"
      : c.state === "human"
        ? c.handoff
          ? "the AI handed the screen to a person"
          : "a person is driving"
        : "the screen is free";
  const lease = c.state === "agent" && c.leaseUntil ? ` (hold until ${c.leaseUntil})` : "";
  const note = c.note ? `\n  note: ${c.note}` : "";
  return `${c.sessionId}: ${who}${lease}${note}`;
}

export function registerLive(program: Command): void {
  const live = program
    .command("live <id>")
    .description("Open a desktop capsule's live screen (a signed link, no login)")
    .option("--view", "Watch only (default: watch, take over and hand back)")
    .option("--ttl <minutes>", "Link lifetime in minutes (default 240, max 1440)", (v) => parseInt(v, 10))
    .option("--open", "Open the link in your browser (default when the link can take control)")
    .option("--no-open", "Only print the link")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ view?: boolean; ttl?: number; open?: boolean }>();
        const link = await client.capsules.consoleLink(id, {
          mode: o.view ? "view" : "control",
          ttlSec: o.ttl ? o.ttl * 60 : undefined,
        });
        result(link, (l: any) => `${l.url}\n(${l.mode} link, expires ${l.expiresAt}; anyone with it can ${l.mode === "view" ? "watch" : "watch and take over"})`);
        if (o.open !== false && !o.view) {
          if (!openUrl(link.url)) info("Could not open a browser; open the link above.");
        }
      }),
    );

  live
    .command("revoke <id>")
    .description("End every live link of a capsule and close the consoles opened with them")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.revokeConsoleLinks(id);
        result({ revoked: true }, () => `✓ every live link of ${id} is revoked`);
      }),
    );

  const control = program
    .command("control <id>")
    .description("Who is driving a desktop capsule's screen (free, the AI, or a person)")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        result(await client.capsules.control(id), describe);
      }),
    );

  control
    .command("take <id>")
    .description("Hold the screen for a person; the AI's input waits")
    .option("--note <text>", "A note shown on the live console")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ note?: string }>();
        result(await client.capsules.takeControl(id, { as: "person", note: o.note }), describe);
      }),
    );

  control
    .command("release <id>")
    .description("Hand the screen back, optionally with a note for the AI")
    .option("--note <text>", "What you did, for the AI")
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ note?: string }>();
        result(await client.capsules.releaseControl(id, { as: "person", note: o.note }), describe);
      }),
    );

  control
    .command("pace <id> <pace>")
    .description("How the AI's input plays on the screen: fast, natural (glides, readable typing) or presentation")
    .action((id: string, pace: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (!["fast", "natural", "presentation"].includes(pace)) throw new Error("pace must be fast, natural or presentation");
        const st = await client.capsules.setPace(id, pace as "fast" | "natural" | "presentation");
        result(st, () => `✓ pace ${st.pace ?? "fast"}`);
      }),
    );

  control
    .command("visible <id> <on|off>")
    .description("Visible mode: on, the AI is asked to do every step on the screen; off (the default), commands first")
    .action((id: string, mode: string, _o, command: Command) =>
      withClient(command, async (client) => {
        if (mode !== "on" && mode !== "off") throw new Error("visible takes on or off");
        const st = await client.capsules.setVisible(id, mode === "on");
        result(st, () => `✓ visible ${st.visible ? "on: every step on the screen" : "off: commands first"}`);
      }),
    );

  control
    .command("wait <id>")
    .description("Wait until a person hands the screen back")
    .option("--timeout <seconds>", "Give up after this long (default 600)", (v) => parseInt(v, 10))
    .action((id: string, _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ timeout?: number }>();
        const r = await client.capsules.waitForHandback(id, { timeoutMs: (o.timeout ?? 600) * 1000 });
        result(r, (d: any) => (d.handedBack ? `✓ handed back${d.note ? `: ${d.note}` : ""}` : "still held by a person (timed out)"));
        if (!r.handedBack) process.exitCode = 2;
      }),
    );

  program
    .command("handoff <id> <note...>")
    .description("Hand the screen to the person watching, with a note, and wait for it back")
    .option("--timeout <seconds>", "How long to wait (default 600)", (v) => parseInt(v, 10))
    .option("--no-wait", "Hand over and return at once")
    .action((id: string, note: string[], _o, command: Command) =>
      withClient(command, async (client) => {
        const o = command.opts<{ timeout?: number; wait?: boolean }>();
        const text = note.join(" ");
        if (o.wait !== false) info("Waiting for the person to press Done, hand back...");
        const r = await client.capsules.handoff(id, text, { wait: o.wait !== false, timeoutMs: (o.timeout ?? 600) * 1000 });
        result(r, (d: any) =>
          o.wait === false ? `✓ handed over: ${text}` : d.handedBack ? `✓ handed back${d.note ? `: ${d.note}` : ""}` : "still held by the person (timed out)",
        );
        if (o.wait !== false && !r.handedBack) process.exitCode = 2;
      }),
    );

  program
    .command("say <id> <text...>")
    .description("Show one line of narration on the capsule's live console")
    .action((id: string, text: string[], _o, command: Command) =>
      withClient(command, async (client) => {
        await client.capsules.say(id, text.join(" "));
        result({ ok: true }, () => "✓ shown on the live console");
      }),
    );
}
