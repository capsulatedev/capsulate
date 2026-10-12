# @capsulate/sdk

The official [Capsulate](https://capsulate.dev) SDK: launch and drive isolated cloud
sandboxes ("capsules") from JavaScript / TypeScript. This one client powers the `cap`
CLI, the Capsulate MCP server, and your own agents. Everything you can do in the
Capsulate dashboard, you can do here (API/UI parity is a platform law).

## Install

```bash
npm install @capsulate/sdk
```

## Quickstart

```ts
import { Capsulate } from "@capsulate/sdk";

const cap = new Capsulate({ apiKey: process.env.CAPSULATE_API_KEY });

// Launch a capsule and wait until it is ready.
const c = await cap.capsules.launch({
  template: "ubuntu-22.04-headless",
  size: "2c4g",
});

// Run code inside it.
const out = await c.exec(["python3", "-c", "print(40 + 2)"]);
console.log(out.stdout); // "42\n"

// Read & write files.
await c.writeFile("/workspace/app.py", "print('hi from the capsule')");
console.log(await c.readFileText("/workspace/app.py"));

// Clean up.
await c.destroy();
```

## Authentication

| Credential | How to get it | Good for |
| --- | --- | --- |
| **API key** (`cap_live_…`) | Dashboard → **Settings → API & Keys**, or `cap apikey create` | Agents, CI, the MCP server |
| **Access token** (JWT) | An interactive login (`cap login`) | Team / billing administration |

```ts
new Capsulate({ apiKey: "cap_live_…" });            // recommended
new Capsulate({ token: "<jwt>", baseUrl: "…" });    // interactive
```

Environment fallbacks: `CAPSULATE_API_KEY`, `CAPSULATE_TOKEN`, `CAPSULATE_BASE_URL`,
`CAPSULATE_TEAM_ID`.

## What's available

- **Capsules**: `create` / `launch` / `list` / `history` / `get` / `destroy` / `suspend` / `resume`
- **Interaction**: `exec`, `run`, `readFile`, `writeFile`, `setEnv`
- **Computer-use**: `screenshot`, `click`, `move`, `scroll`, `drag`, `type`, `key`
  - Each input verb takes optional `{ screenshot: true, screenshotDelayMs }` to capture the
    resulting frame in the same call (act→observe): `await c.click(x, y, { screenshot: true, screenshotDelayMs: 300 })`
    returns the post-action screenshot on `result.screenshot`. The delay lets the UI settle first.
- **Recordings**: `recordings.{list,start,stop,status,download}`
- **Snapshots**: `snapshots.{list,create,delete}` (+ restore via `capsules.create({ snapshot })`)
- **Volumes**: `volumes.{create,list,get,delete,attach,detach}`
- **Templates / Bundles / Catalog**: `templates.list`, `bundles.list`, `catalog.list`
- **Sharing & Ports**: `sharing.{share,guests,setGuestPermission,removeGuest}`, `ports.{forward,remove}`
- **Account**: `teams.list`, `billing.balance`, `apiKeys.{list,create,revoke}`
- **Skills** (0.7.0), to learn a job once and replay it in minutes:
  - `skills.{list,get,save,versions,approve,reject,rollback,import,export,environment,rehearse,setWeekly}`: a skill is an
    Agent Skills folder (`SKILL.md`) plus `capsulate/skill.json` (environment, inputs, procedures, checks, traps).
  - `capsules.launch({ skill })` starts its environment; `runActions` takes `{ do: "use", procedure, args }`.
  - `runs.{start,get,list,continue,cancel}` run a procedure in the background and wait for your answers; `inbox.list()`.
  - `lessons.{start,note,pause,resume,finish,discard,digest,draft,onCapsule,addAudio}`: a person teaches on the shared
    screen (each click joined to the element it hit, passwords masked, optionally video and voice), or the AI teaches
    itself toward a goal; the digest is what your AI reads to write the skill.

```ts
const lesson = await cap.lessons.start({ sessionId: c.id, title: "Export a PDF", goal: "Export the report with its charts", mode: "ai" });
// ... the AI works on the capsule; every step is logged ...
await cap.lessons.finish(lesson.lessonId);
const digest = await cap.lessons.digest(lesson.lessonId); // then cap.skills.save(...)
```

Errors are thrown as `CapsulateError` (`.status`, `.body`, `.isAuthError`, …).

> Types mirror the platform's authoritative Go contracts; see the in-dashboard
> **Docs** section or the OpenAPI spec at `docs/api/openapi.yaml`.
