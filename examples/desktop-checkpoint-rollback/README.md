# desktop-checkpoint-rollback

## What it does

Launches an Ubuntu desktop capsule, writes a known-good marker file, takes a checkpoint,
deliberately breaks the machine, rolls back to the checkpoint, and asserts that the damage is
gone. It exits non-zero if the verification fails.

This is the safety net for an agent that is about to do something it cannot undo: an installer,
a migration, a settings dialog it does not understand. Checkpoint first, act, and roll back if
the verification does not hold.

## The one thing to understand

Rolling back does not rewind the running machine. It launches a **fresh capsule** cloned from
the snapshot and destroys the current one, so the capsule id and the address both change:

```ts
const restored = await box.rollback(checkpoint.id);   // a new Capsule
box = await restored.waitUntilActive();               // use this from now on
```

Pass `{ destroyCurrent: false }` to keep the broken one for a post mortem, but remember that a
free account allows only one capsule at a time, so the second launch will answer `403` with
code `policy_denied`.

## Run it

```bash
npm install
export CAPSULATE_API_KEY="cap_live_..."   # dashboard: Settings, API and Keys
npm start
```

Expected output:

```
launched sess-ubuntu-22.04-desktop-0a1b2c3d
before checkpoint: good
checkpoint snap_112233
after damage:      broken
rolled back into sess-ubuntu-22.04-desktop-7f8e9d0c
after rollback:    good

verified: the capsule is back to its checkpointed state.
destroyed sess-ubuntu-22.04-desktop-7f8e9d0c
```

## Expected time

About 1 minute. Two launches from the warm pool at roughly 2 seconds each, a checkpoint in well
under a second, and the file operations are instant. A desktop template that misses the warm
pool cold boots instead, which takes longer.

## Expected cost

Two capsules, because the rollback creates the second one. Size `1c2g` (Micro) is 0.2 credits
per minute, and both are alive for well under a minute, so budget one minute each:

```
0.2 credits/minute x 1 minute (original)  = 0.2 credits
0.2 credits/minute x 1 minute (restored)  = 0.2 credits
                                   total  = 0.4 credits = 0.004 USD
```

The checkpoint itself is storage, metered at about 0.05 USD per GB-month while it is held. Held
for a minute and then deleted (the `finally` block does that), it rounds to nothing: a 1 GB
delta for one minute is about 0.05 / 30 / 24 / 60, which is 0.00001 USD. Snapshots you keep for
weeks are the ones worth counting.

## What to change first

- Replace the "break something" step with the real risky operation and the file check with a
  real verification: `await box.findElement({ name: "Save" })`, an exit code, an HTTP probe.
- `box.listCheckpoints()` gives every checkpoint of a capsule, so an agent can walk back more
  than one step.
- On a headless capsule (`ubuntu-22.04-headless`) all of this works the same and boots faster.
  The desktop is only needed once you add computer use.
