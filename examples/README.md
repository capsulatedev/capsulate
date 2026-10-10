# Capsulate examples

Seven small programs you can copy and run. Each folder has its own README with what it does,
how long it takes, and what it costs in credits with the arithmetic written out.

| Example | What it shows | Language |
| --- | --- | --- |
| [python-requests-hello](./python-requests-hello) | The REST API with nothing but `requests`: launch, wait, exec, destroy | Python |
| [ts-agent-loop](./ts-agent-loop) | An agent that drives a capsule, using the Vercel AI SDK v5 and `@capsulate/ai-tools` | TypeScript |
| [mcp-claude-desktop](./mcp-claude-desktop) | Wiring the MCP server into Claude Desktop or Cursor | JSON config |
| [claude-code-live-handoff](./claude-code-live-handoff) | Claude Code works on a desktop you watch live, narrates each step, and hands you the screen for a choice or a sign in | JSON config and a prompt |
| [desktop-checkpoint-rollback](./desktop-checkpoint-rollback) | Checkpoint a desktop capsule, break something, roll back, verify | TypeScript |
| [desktop-batch-form-fill](./desktop-batch-form-fill) | Records through a web form in the capsule's own Chrome, then a desktop app in one `runActions` call, every step timed, on Linux or Windows | TypeScript |
| [github-action-pr-test](./github-action-pr-test) | Run a pull request's tests inside a capsule from CI | GitHub Actions |

## Before you start

1. Create an API key in the dashboard under Settings, API and Keys.
2. Export it: `export CAPSULATE_API_KEY="cap_live_..."` (PowerShell: `$env:CAPSULATE_API_KEY="cap_live_..."`).
3. Optional: point at another origin with `CAPSULATE_BASE_URL`. The default is `https://api.capsulate.dev`.

## Reading the cost lines

Compute is metered per second, by size, and billed only while a capsule is active.
1 credit is 0.01 USD, and every new account starts with 1,000 credits.

| Size | vCPU and RAM | Per hour | Per minute |
| --- | --- | --- | --- |
| Nano `1c512m` | 1 vCPU, 512 MB | 0.06 USD | 0.1 credits |
| Micro `1c2g` | 1 vCPU, 2 GB | 0.12 USD | 0.2 credits |
| Standard `2c4g` | 2 vCPU, 4 GB | 0.24 USD | 0.4 credits |
| Performance `4c8g` | 4 vCPU, 8 GB | 0.48 USD | 0.8 credits |

Clicks, keystrokes, screenshots and commands are free. You pay for the machine's time, so the
one number that matters in every example below is how long the capsule stays alive.

Nothing is billed during the beta. The cost lines are what these runs will cost once paid plans
open, published now so nobody has to guess.

## Free tier, in one line

One capsule at a time, 60 minutes of maximum lifetime, size `1c2g` by default, Linux only, and
60 API requests per minute per key. Destroy a capsule before launching the next one, or a launch
answers `403` with code `policy_denied`.
