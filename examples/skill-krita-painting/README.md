# skill-krita-painting

## What it does

Learn once, repeat in minutes. An AI learned to paint in Krita on a Capsulate desktop while painting the Mona
Lisa: about an hour the first time, most of it finding Krita's controls and three traps. What it learned is the
skill in `krita-painting/`. With it, a new picture is a plan of calls and about two minutes of painting.

The program:

1. puts the skill in your team's library: a new skill, a new version, or nothing when your team's current version is
   the same;
2. rehearses it: a fresh capsule, the skill's setup (install Krita, start it with a 900 x 1200 canvas, set the
   view), then its checks; a new version that passes is approved;
3. paints a lighthouse at dusk from the skill's procedures on a capsule launched for the skill, downloads the PNG to
   `out/lighthouse.png`, and destroys the capsule.

![A lighthouse at dusk, painted from the skill](./lighthouse.jpg)

## The skill folder

`krita-painting/` is an [Agent Skills](https://agentskills.io) folder: any agent that reads skills can read its
`SKILL.md`. Capsulate also runs the part only it can, `capsulate/skill.json`:

| Part | What it holds |
|---|---|
| `SKILL.md` | When to use the skill, the canvas, every procedure, how to plan a painting, what went wrong while learning |
| `capsulate/skill.json` | The environment (Ubuntu desktop, `4c8g`, the `setup` procedure, a fingerprint of Krita 5.0.2), the `canvas` frame, inputs, 16 procedures, 3 checks and 9 traps |
| `references/painting.md` | A painting's passes, shapes, light, palettes that worked and measured timings |

The `canvas` frame maps canvas pixels (900 x 1200) to the screen and pulls every point of a stroke back onto the
canvas, so a plan never names a screen position and never makes Krita scroll its view.

## Run it

```bash
npm install
export CAPSULATE_API_KEY="cap_live_..."   # dashboard: Settings, API and Keys
npm start                    # import, rehearse, paint the lighthouse
npm start -- --main          # paint the skill's own sunset (its main procedure) instead
npm start -- --no-rehearse   # paint with the team's current version, no rehearsal
```

Expected output, roughly (a progress line updates while each run works):

```
1. Imported krita-painting as version 1 (current).
2. Rehearsal passed in 150.2 s (a fresh capsule, the setup, the checks):
   ok   dpkg-query -W -f ${Version} krita
   ok   The canvas sits where the frame says
   ok   A fill and a stroke land where they should
   ok   main paints a sunset and exports it
3. The run succeeded in 241.6 s: 605 steps replayed from the skill, 236.4 s of work.
   Saved out/lighthouse.png.
   Destroyed sess-ubuntu-22.04-desktop-0a1b2c3d.
```

## The calls to understand

```ts
// The folder goes to the library as it is: SKILL.md, the spec, the references.
const imported = await cap.skills.import({ skillMd, spec, files });

// A rehearsal is a run of its own: a fresh capsule from the skill's environment, the setup, the checks.
const rehearsal = await cap.runs.wait((await cap.skills.rehearse(name, version)).runId);

// A run of the skill: launch a capsule for it (the setup runs in the launch), then the steps. Each use step calls
// a procedure of the skill with its arguments, in canvas pixels.
const run = await cap.runs.start({
  skill: "krita-painting",
  steps: [
    { do: "use", procedure: "color", args: { hex: "#264653" } },
    { do: "use", procedure: "fill", args: { path: [[-10, 700], [910, 700], [910, 1210], [-10, 1210]], smooth: false } },
    { do: "use", procedure: "brush", args: { preset: "Stamp Grass", size: 50 } },
    { do: "use", procedure: "stroke", args: { path: [[600, 712], [700, 642], [905, 602]] } },
  ],
  launch: true,
  keep: true,
});
```

`src/lighthouse.ts` is the whole plan: 114 calls in canvas pixels, from the sky to the export. It is what an AI
writes after reading `SKILL.md`, and it knows nothing about where Krita's buttons are.

A run that meets something it cannot do waits instead of failing: a step that fails, or a person who takes the
screen, puts it in `needs_help`. Continue it with replacement steps (`cap.runs.fix`), and the fix becomes a proposed
version of the skill. The program cancels a waiting run so its capsule is not held.

## Expected time

About 7 minutes end to end, measured on prod before release:

| Part | Time |
|---|---|
| The setup on a fresh capsule (in the rehearsal and in the run) | about 105 s: installing Krita about 80 s, starting it about 25 s |
| The rehearsal's checks | about 35 s |
| The lighthouse: 114 calls, about 600 steps | about 125 s |
| The sunset (`--main`): 20 calls | about 22 s |

The first time, without the skill, the same kind of picture took about an hour.

## Expected cost

Size `4c8g` (Performance) at 0.8 credits per minute. The rehearsal's capsule is alive for about 2.5 minutes and the
run's for about 4:

```
0.8 credits/minute x (2.5 + 4) minutes alive = 5.2 credits = 0.052 USD
```

Without the rehearsal (`--no-rehearse`), 3.2 credits. Steps are free: you pay for the machine's time. Nothing is
billed during the beta.

A free account runs one capsule at a time; the rehearsal ends its capsule before the run launches one. If your plan
does not allow `4c8g`, set `environment.size` in `capsulate/skill.json` to `2c4g`.

## What to change first

- **Your own picture.** Write a plan like `src/lighthouse.ts`, or give your agent `SKILL.md` and ask it for one: a
  list of `use` steps in canvas pixels, broad shapes first, details last.
- **Skip the install.** Launch once, then save the capsule as the skill's environment; launches start from the
  saved template with Krita installed, and the setup only starts it:
  `await cap.skills.environment("krita-painting", { sessionId })`.
- **Keep it honest.** `await cap.skills.setWeekly("krita-painting", true)` rehearses the current version every week
  and puts a failure or a changed Krita version (the fingerprint) in the inbox.
- **Watch it paint.** Launch the capsule yourself, open its console, then run the plan on it:

  ```ts
  const box = await cap.capsules.launch({ skill: "krita-painting" }); // the setup runs in the launch
  const link = await box.consoleLink({ mode: "view" });             // open link.url; treat it like a password
  const run = await cap.runs.start({ skill: "krita-painting", sessionId: box.id, steps: lighthouse() });
  ```
