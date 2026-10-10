# desktop-batch-form-fill

## What it does

Data entry on a real desktop, timed step by step. The program launches a desktop capsule and:

1. opens a web form in the capsule's own Chrome (a local `data:` page, so it needs no outside
   service), reads the page once as an outline of elements with refs, and saves three customers
   through it: fill, choose, tick, click, wait for the confirmation, read it;
2. writes the three confirmation numbers into the desktop's text editor in one `runActions` call:
   open the editor by name, set its text by element, wait until the text shows, read the screen;
3. prints how long every step took, and destroys the capsule, also when a step fails.

Linux by default. Pass `windows` and the same program runs on a Windows desktop.

Nothing here uses coordinates or screenshots. The browser steps act on refs from one snapshot of
the page, and the editor's text area is found by its role. The one difference between the systems
is that role's name: a multi-line editor is a `text` on Linux (Mousepad) and a `document` on
Windows (Notepad).

## Run it

```bash
npm install
export CAPSULATE_API_KEY="cap_live_..."   # dashboard: Settings, API and Keys
npm start                # an Ubuntu desktop
npm start -- windows     # a Windows desktop, for invited testers
```

Expected output on Linux, roughly. Your times depend on how far you are from the capsule's region:

```
Linux desktop: ubuntu-22.04-desktop, size 2c4g

  1870 ms  launch the capsule: sess-ubuntu-22.04-desktop-0a1b2c3d

The web form, in the capsule's own Chrome
  4810 ms  open the form: Chrome started
   158 ms  read the page once: 5 elements, each with a ref
Ada Lovelace
   152 ms  fill the name
   149 ms  fill the email
   151 ms  choose Team
   171 ms  tick Priority onboarding
   176 ms  click Save customer
   155 ms  wait for the confirmation
   150 ms  read it: Customer 1 saved as C-482913: Ada Lovelace, Team, priority.
Grace Hopper
   ...      the same steps, without the tick
Alan Turing
   ...

The text editor, in one runActions call
   812 ms  open Mousepad by name and wait for its window: window "Untitled 1 - Mousepad"
   405 ms  set its text by element: 158 characters, by text
    41 ms  wait until the text shows: it shows
    38 ms  read the screen: 1280x800, active window "Untitled 1 - Mousepad"
  1452 ms  the whole call, there and back

destroyed sess-ubuntu-22.04-desktop-0a1b2c3d, alive for about 12 s
```

Each browser call takes about 150 ms, nearly all of it the trip to the capsule and back: the page
itself answers in a few milliseconds. The first call is the slow one, because it starts Chrome.
Inside the `runActions` call each time is the server's own, and the steps follow each other with
no trip in between, so four steps cost one round trip.

## The calls to understand

```ts
// One snapshot gives every ref. Saving resets the form but keeps its elements, so the same refs
// serve every customer. Take a new snapshot when the page itself changes.
const page = await box.browser.snapshot({ interactive: true });
// [e1] textbox "Full name", [e2] textbox "Email", [e3] combobox "Plan", ...
await box.browser.fill({ ref: "e1" }, "Ada Lovelace");
await box.browser.wait({ text: "Customer 1 saved" }, { timeoutMs: 10_000 });

// Several steps in one call: they run back to back on the server and stop at the first that fails.
const run = await box.runActions([
  { do: "open", target: "Mousepad", kind: "app", waitMs: 30_000 },
  { do: "element", action: "set_value", selector: { role: "text" }, window: "Mousepad", value: summary },
  { do: "wait_for", condition: "text", text: lastNumber, window: "Mousepad", timeoutMs: 10_000 },
  { do: "screen" },
]);
```

`browser.wait` by text looks only at interactive elements, headings, labels and alerts. That is
why the form's confirmation is a `role="alert"`: the same text in a plain `div` would never match.

A `wait_for` that ends unmet fails its step, and a failed step stops the run, so `run.ok` is the
whole check. On Windows the steps are the same with `notepad`, `Notepad` and the role `document`.

## Expected time

About 1 minute end to end on Linux, most of it `npm install`. The capsule is alive for 10 to 20
seconds: a warm launch in about 2 seconds, Chrome's first start in about 5, some twenty more
browser calls in about 3, and the editor in under 2.

On Windows the capsule is alive for under a minute. Chrome takes 8 to 11 seconds to start the
first time, opening Notepad on a fresh capsule 10 to 14 seconds, and Notepad's text area has no
direct way to set its text, so the text is typed or pasted, which takes a few seconds more.

## Expected cost

Linux, size `2c4g` (Standard) at 0.4 credits per minute. The capsule is alive for under 20
seconds, so budget a quarter of a minute:

```
0.4 credits/minute x 0.25 minutes alive = 0.1 credits = 0.001 USD
```

The 1,000 welcome credits cover this run about 10,000 times (1,000 / 0.1).

Windows is an evaluation build for invited testers and is not billed. Once it is licensed it is
planned at about 0.08 USD per vCPU-hour on top of the Linux rate:

```
Linux rate for 2c4g                    0.24 USD/hour
Windows premium, 2 vCPU x 0.08 USD     0.16 USD/hour
                                total  0.40 USD/hour = 40 credits/hour, about 0.67 credits/minute
0.67 credits/minute x 1 minute alive = about 0.67 credits = about 0.007 USD
```

The browser calls, element actions and the screen read are free: you pay for the machine's time.
Nothing is billed during the beta.

A free account runs one capsule at a time, Linux only. If a launch answers `403` with code
`policy_denied`, the program says so; `npx @capsulate/cli capsule list` shows what is running.

## What to change first

- **Your own form.** Open its URL instead of the `data:` page, read it once with
  `snapshot({ interactive: true })`, and pick refs by role and name the way `refs()` does.
- **More records.** Add rows to `CUSTOMERS`. On Linux each record is about one second of calls.
- **Watch it live.** After the launch, `const link = await box.consoleLink({ mode: "view" })` and
  open `link.url` in your browser; add `await box.setPace("natural")` so a person can follow.
  Treat the link like a password: anyone with it can watch until it expires or the capsule ends.
- **See the end.** `box.runActions(steps, { observe: "screenshot" })` returns a screenshot of the
  screen after the last step in `run.observation`.
