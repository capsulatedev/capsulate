# ts-agent-loop

## What it does

Gives a model a real machine and lets it work. The Vercel AI SDK v5 runs the loop,
`@capsulate/ai-tools` supplies the tools, and the model launches a capsule, writes a Python
file into it, runs it, reads the output, and destroys the capsule. Then it reports the answer.

The point of the example is the stopping condition. `stopWhen: stepCountIs(8)` is the v5
spelling; on AI SDK v4 the same call is `maxSteps: 8` and nothing else changes, because every
Capsulate tool carries its zod schema under both `inputSchema` (v5) and `parameters` (v4).

## Run it

```bash
npm install
export CAPSULATE_API_KEY="cap_live_..."   # dashboard: Settings, API and Keys
export OPENAI_API_KEY="sk-..."
npm start
```

This example needs `@capsulate/ai-tools` 0.2.1 or newer, the release that adds the AI SDK v5
`inputSchema`. If `npm install` cannot find that version yet, it has not been published: either
wait for it, or pin `ai@^4` and `@ai-sdk/openai@^1` and change `stopWhen: stepCountIs(8)` to
`maxSteps: 8`, which works with 0.2.0.

Expected output, roughly:

```
5 steps, 4 tool calls
  called capsulate_launch_capsule
  called capsulate_write_file
  called capsulate_exec
  called capsulate_destroy_capsule

2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71
```

## Expected time

About 2 minutes. The capsule launches in about 2 seconds and the commands are instant; the
wall clock is the model thinking between steps.

## Expected cost

Two meters, and only one of them is ours.

Capsulate, size `1c2g` (Micro) at 0.2 credits per minute, alive for about 2 minutes while the
model works:

```
0.2 credits/minute x 2 minutes alive = 0.4 credits = 0.004 USD
```

Your model provider bills the tokens separately, at their rates. Capsulate does not meter tool
calls: clicks, commands, files and screenshots are free, you pay for the machine's time.

## If the model forgets to destroy the capsule

It happens, and a free account only allows one capsule at a time, so the next run answers `403`
with code `policy_denied`. List and clean up from the terminal:

```bash
npx @capsulate/cli capsule list
npx @capsulate/cli capsule destroy <id>
```

## What to change first

- Swap `openai("gpt-4o")` for any model the AI SDK supports. The tools do not care.
- Raise `stepCountIs(8)` for longer jobs. Each step is one model call plus at most one tool call.
- Ask for a desktop instead (`ubuntu-22.04-desktop`) and the computer-use tools become useful:
  `capsulate_ui_tree`, `capsulate_find_element`, `capsulate_click_element`, `capsulate_ocr`.
