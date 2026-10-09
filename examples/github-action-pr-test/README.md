# github-action-pr-test

## What it does

Runs a pull request's test suite inside a fresh, isolated capsule instead of on the CI runner,
and posts the result back as a PR comment. The capsule is a real VM with its own kernel, so a
test suite that needs Docker, privileged mounts, KVM, or simply a machine that nothing else has
touched behaves the way it does on a laptop.

`pr-test.yml` is the whole workflow. It detects the project type (npm, pip, go) and runs the
obvious command.

## Install it

1. Copy `pr-test.yml` into `.github/workflows/` in your repository.
2. Add a repository secret `CAPSULATE_API_KEY` with a `cap_live_...` key from the dashboard
   (Settings, API and Keys).
3. Open a pull request.

The action is `capsulatedev/run-action@v1`. Its inputs:

| Input | Default | What it is |
| --- | --- | --- |
| `api-key` | required | The key, from a repository secret |
| `run` | required | Shell commands to run inside the capsule. `REPO_URL` and `REPO_SHA` are set for you |
| `template` | `ubuntu-22.04-headless` | Template or OS to launch |
| `size` | `2c4g` | Resource size |
| `base-url` | `https://api.capsulate.dev` | API origin |
| `team-id` | resolved from the key | Team id |
| `comment` | `true` | Post the result as a PR comment |
| `github-token` | `github.token` | Token used for that comment |

It sets two outputs, `exit-code` and `session-id`, so later steps can branch on the result.

## Expected time

About 30 seconds of overhead on top of your test suite: a warm launch is roughly 2 seconds, the
clone and the install are whatever they normally are, and the capsule is destroyed at the end of
the step even when the tests fail.

## Expected cost

The workflow's default size is `2c4g` (Standard), 0.4 credits per minute. A 3-minute test run:

```
0.4 credits/minute x 3 minutes alive = 1.2 credits = 0.012 USD per pull request run
```

At 50 runs a month that is 60 credits, or 0.60 USD. Dropping to `size: 1c2g` halves it to 0.2
credits per minute if your suite fits in 2 GB of RAM.

Remember the free tier allows one capsule at a time, so two pull requests building at once will
have the second one answer `403` with code `policy_denied`. Ask for a higher concurrency limit
before pointing a busy repository at it.

## What to change first

- Replace the manifest detection with your actual command. The `run` input is plain shell.
- `template: ubuntu-22.04-desktop` if the suite needs a display (browser tests, screenshots).
- `comment: false` if you would rather read the job log than get a PR comment on every push.
