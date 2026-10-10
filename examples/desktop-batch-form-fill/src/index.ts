// Data entry on a real desktop, timed step by step.
//
//   npm install
//   export CAPSULATE_API_KEY="cap_live_..."
//   npm start               # an Ubuntu desktop
//   npm start -- windows    # a Windows desktop (invited testers)
//
// 1. The capsule's own Chrome opens a web form (a local data: URL, so nothing outside is needed). The program
//    reads the page once as an outline of elements with refs, then saves each customer through the form by ref:
//    fill, choose, tick, click, wait for the confirmation, read it.
// 2. The desktop's text editor gets the confirmation numbers in ONE runActions call: open the editor by name,
//    set its text by element, wait until the text shows, read the screen.
//
// No coordinates and no screenshots anywhere. Every step prints its time, and the capsule is destroyed at the
// end, also when a step fails.

import {
  Capsulate,
  CapsulateError,
  type BrowserSnapshot,
  type Capsule,
  type ElementActionResult,
  type OpenResult,
  type RunStep,
  type RunStepResult,
  type ScreenInfoResult,
  type WaitForResult,
} from "@capsulate/sdk";

const apiKey = process.env.CAPSULATE_API_KEY;
if (!apiKey) {
  console.error("Set CAPSULATE_API_KEY first (dashboard: Settings, API and Keys).");
  process.exit(1);
}

// What differs between the two systems. A multi-line editor is a "text" on Linux and a "document" on Windows.
const SYSTEMS = {
  linux: {
    label: "Linux",
    template: "ubuntu-22.04-desktop",
    editor: "Mousepad",
    window: "Mousepad",
    textRole: "text",
    newline: "\n",
  },
  windows: {
    label: "Windows",
    template: "windows-server-2022-desktop",
    editor: "notepad",
    window: "Notepad",
    textRole: "document",
    newline: "\r\n",
  },
};
const which = (process.argv[2] ?? "linux").toLowerCase();
if (which !== "linux" && which !== "windows") {
  console.error("Usage: npm start              (an Ubuntu desktop)\n       npm start -- windows   (a Windows desktop)");
  process.exit(2);
}
const sys = which === "windows" ? SYSTEMS.windows : SYSTEMS.linux;

// The records to enter.
const CUSTOMERS = [
  { name: "Ada Lovelace", email: "ada@example.com", plan: "Team", priority: true },
  { name: "Grace Hopper", email: "grace@example.com", plan: "Enterprise", priority: false },
  { name: "Alan Turing", email: "alan@example.com", plan: "Starter", priority: true },
];

// The web form. Its answer is a role="alert", because browser.wait by text looks only at interactive elements,
// headings, labels and alerts, never at a plain div's text. Saving resets the form for the next customer.
const FORM = `<!doctype html><html><head><meta charset="utf-8"><title>New customer</title>
<style>body{font:16px system-ui,sans-serif;margin:40px auto;max-width:520px}label{display:block;margin:12px 0 4px}
input,select{width:100%;box-sizing:border-box;padding:6px;font:inherit}
.row{display:flex;gap:8px;align-items:center;margin-top:12px}.row input{width:auto}.row label{margin:0}
button{margin-top:16px;padding:8px 18px;font:inherit}#result{margin-top:20px;padding:12px;background:#e8f0ff}</style>
</head><body><h1>New customer</h1><form id="f">
<label for="name">Full name</label><input id="name" required>
<label for="email">Email</label><input id="email" type="email" required>
<label for="plan">Plan</label>
<select id="plan"><option>Starter</option><option>Team</option><option>Enterprise</option></select>
<div class="row"><input id="priority" type="checkbox"><label for="priority">Priority onboarding</label></div>
<button type="submit">Save customer</button></form>
<p id="result" role="alert" hidden></p>
<script>
let saved = 0;
document.getElementById("f").addEventListener("submit", (event) => {
  event.preventDefault();
  const field = (id) => document.getElementById(id);
  saved += 1;
  const number = "C-" + Math.floor(100000 + Math.random() * 900000);
  field("result").textContent = "Customer " + saved + " saved as " + number + ": " + field("name").value +
    ", " + field("plan").value + (field("priority").checked ? ", priority." : ".");
  field("result").hidden = false;
  event.target.reset();
});
</script></body></html>`;
const FORM_URL = "data:text/html;charset=utf-8," + encodeURIComponent(FORM);

const cap = new Capsulate({ apiKey });
const pad = (ms: number) => `${String(ms).padStart(6)} ms`;

/** Run one step and print how long it took, with what it found. */
async function step<T>(label: string, fn: () => Promise<T>, found?: (r: T) => string): Promise<T> {
  const t = Date.now();
  const r = await fn();
  const what = found ? found(r) : "";
  console.log(`${pad(Date.now() - t)}  ${label}${what ? `: ${what}` : ""}`);
  return r;
}

/** A finder over one page outline: the ref of the element with this role whose name contains `name`. */
function refs(page: BrowserSnapshot) {
  return (role: string, name: string) => {
    const el = page.items.find((i) => i.role === role && i.name.toLowerCase().includes(name.toLowerCase()));
    if (!el) throw new Error(`the page has no ${role} named "${name}"`);
    return { ref: el.ref };
  };
}

/** What one step of the run found, in a few words. */
function runFound(s: RunStepResult, chars: number): string {
  switch (s.do) {
    case "open": {
      const r = s.result as OpenResult;
      return r.window ? `window "${r.window.title}"` : "";
    }
    case "element": {
      const r = s.result as ElementActionResult;
      return `${chars} characters${r.method ? `, by ${r.method}` : ""}`;
    }
    case "wait_for": {
      const r = s.result as WaitForResult;
      return r.met ? "it shows" : "not seen";
    }
    case "screen": {
      const r = s.result as ScreenInfoResult;
      return `${r.width}x${r.height}, active window "${r.activeWindow?.title ?? ""}"`;
    }
  }
  return "";
}

/** A failure in one line. A failed launch carries its reason in the body's `code`. */
function explain(e: unknown): string {
  if (!(e instanceof CapsulateError)) return e instanceof Error ? e.message : String(e);
  const code = (e.body as { code?: string } | undefined)?.code;
  const hint =
    code === "policy_denied"
      ? " A free account runs one capsule at a time, Linux only: see `npx @capsulate/cli capsule list`."
      : "";
  return `Capsulate error ${e.status}${code ? ` (${code})` : ""}: ${e.message.replace(/[.\s]+$/, "")}.${hint}`;
}

/** Part 1, the web form in the capsule's own Chrome. One snapshot gives the refs; saving resets the form but keeps
 *  its elements, so the same refs serve every customer. Returns each customer's line for the editor. */
async function enterCustomers(box: Capsule): Promise<{ number: string; line: string }[]> {
  console.log("\nThe web form, in the capsule's own Chrome");
  const browser = box.browser;
  await step("open the form", () => browser.open(FORM_URL), (r) => (r.started ? "Chrome started" : "Chrome was open"));
  const page = await step(
    "read the page once",
    () => browser.snapshot({ interactive: true }),
    (s) => `${s.items.length} elements, each with a ref`,
  );
  const ref = refs(page);

  const saved: { number: string; line: string }[] = [];
  for (const [i, c] of CUSTOMERS.entries()) {
    console.log(c.name);
    await step("fill the name", () => browser.fill(ref("textbox", "Full name"), c.name));
    await step("fill the email", () => browser.fill(ref("textbox", "Email"), c.email));
    await step(`choose ${c.plan}`, () => browser.select(ref("combobox", "Plan"), c.plan));
    if (c.priority) await step("tick Priority onboarding", () => browser.click(ref("checkbox", "Priority")));
    await step("click Save customer", () => browser.click(ref("button", "Save customer")));
    await step("wait for the confirmation", async () => {
      const w = await browser.wait({ text: `Customer ${i + 1} saved` }, { timeoutMs: 10_000 });
      if (!w.found) throw new Error("the form never confirmed");
    });
    const { text } = await step("read it", () => browser.text({ selector: "#result" }), (r) => r.text);
    const number = /C-\d+/.exec(text)?.[0];
    if (!number) throw new Error(`no customer number in "${text}"`);
    saved.push({ number, line: `${number}  ${c.name}, ${c.plan}${c.priority ? ", priority" : ""}` });
  }
  return saved;
}

/** Part 2, the desktop app in ONE call: the steps run back to back on the server and the run stops at the first
 *  step that fails. Inside the run each time is the server's own; the last line is the whole round trip. */
async function writeSummary(box: Capsule, saved: { number: string; line: string }[]): Promise<void> {
  console.log("\nThe text editor, in one runActions call");
  const summary = ["New customers", ...saved.map((s) => s.line), `Entered from a ${sys.label} capsule.`].join(
    sys.newline,
  );
  const lastNumber = saved[saved.length - 1].number;
  const steps: RunStep[] = [
    { do: "open", target: sys.editor, kind: "app", waitMs: 30_000 },
    { do: "element", action: "set_value", selector: { role: sys.textRole }, window: sys.window, value: summary },
    { do: "wait_for", condition: "text", text: lastNumber, window: sys.window, timeoutMs: 10_000 },
    { do: "screen" },
  ];
  const labels = [
    `open ${sys.editor} by name and wait for its window`,
    "set its text by element",
    "wait until the text shows",
    "read the screen",
  ];
  const t = Date.now();
  const run = await box.runActions(steps);
  for (const s of run.steps) {
    const what = s.ok ? runFound(s, summary.length) : `FAILED, ${s.error ?? s.code ?? "no reason given"}`;
    console.log(`${pad(s.ms)}  ${labels[s.i]}${what ? `: ${what}` : ""}`);
  }
  console.log(`${pad(Date.now() - t)}  the whole call, there and back`);
  if (!run.ok) {
    throw new Error(`the run stopped at step ${(run.stoppedAt ?? 0) + 1} of ${run.total} (${run.stopReason})`);
  }
}

/** Launch, run both parts, and destroy the capsule whatever happens. Returns the exit code. */
async function main(): Promise<number> {
  console.log(`${sys.label} desktop: ${sys.template}, size 2c4g\n`);
  const born = Date.now();
  let box: Capsule;
  try {
    box = await step(
      "launch the capsule",
      () => cap.capsules.launch({ template: sys.template, size: "2c4g" }),
      (c) => c.id,
    );
  } catch (e) {
    console.error(`The launch failed. ${explain(e)}`);
    return 1;
  }
  try {
    await writeSummary(box, await enterCustomers(box));
    return 0;
  } catch (e) {
    console.error(`\nStopped: ${explain(e)}`);
    return 1;
  } finally {
    await box.destroy().then(
      () => console.log(`\ndestroyed ${box.id}, alive for about ${Math.round((Date.now() - born) / 1000)} s`),
      (e: unknown) =>
        console.error(`\nCould not destroy ${box.id}: ${explain(e)} Run: npx @capsulate/cli capsule destroy ${box.id}`),
    );
  }
}

// An exit code, not process.exit(): the process ends on its own once the last request has closed.
process.exitCode = await main();
