// Checkpoint a desktop capsule, break something inside it, roll back, verify the damage
// is gone. This is the safety net an agent needs before it does something destructive.
//
//   npm install
//   export CAPSULATE_API_KEY="cap_live_..."
//   npm start
//
// A checkpoint is a snapshot of the capsule's disk. Rolling back does NOT rewind the running
// machine: it launches a fresh capsule cloned from the snapshot and (by default) destroys the
// current one. So the capsule id changes, and the handle returned by rollback() is the one to
// use from then on.

import { Capsulate } from "@capsulate/sdk";

const apiKey = process.env.CAPSULATE_API_KEY;
if (!apiKey) {
  console.error("Set CAPSULATE_API_KEY first (dashboard: Settings, API and Keys).");
  process.exit(1);
}

const cap = new Capsulate({ apiKey });
const MARKER = "/root/state.txt";

// A desktop template, because checkpoint and rollback are what you want around computer use.
// Everything below works on ubuntu-22.04-headless too, at half the boot time.
let box = await cap.capsules.launch({ template: "ubuntu-22.04-desktop", size: "1c2g" });
console.log(`launched ${box.id}`);

// A checkpoint belongs to the capsule that took it, and deleting one is addressed by that
// capsule's id. The rollback below replaces `box` with a new capsule, so keep the original id.
const originalId = box.id;
let checkpointId: string | undefined;
try {
  // 1. A known-good state.
  await box.writeFile(MARKER, "good\n");
  console.log(`before checkpoint: ${(await box.readFileText(MARKER)).trim()}`);

  // 2. Checkpoint it. Takes well under a second: it is a copy-on-write delta, not a copy.
  const checkpoint = await box.checkpoint("known-good");
  checkpointId = checkpoint.id;
  console.log(`checkpoint ${checkpoint.id}`);

  // 3. Break something. In a real run this is the risky step: an installer, a migration,
  //    an agent clicking through a settings dialog it does not understand.
  await box.exec(["/bin/sh", "-lc", `echo broken > ${MARKER} && rm -rf /root/.config`]);
  console.log(`after damage:      ${(await box.readFileText(MARKER)).trim()}`);

  // 4. Roll back. The restored machine is a NEW capsule with a new id and a new address;
  //    the damaged one is destroyed unless you pass { destroyCurrent: false }.
  const restored = await box.rollback(checkpoint.id);
  box = await restored.waitUntilActive();
  console.log(`rolled back into ${box.id}`);

  // 5. Verify. This is the assertion the whole example exists for.
  const after = (await box.readFileText(MARKER)).trim();
  console.log(`after rollback:    ${after}`);
  if (after !== "good") throw new Error(`rollback did not restore the marker (got "${after}")`);
  console.log("\nverified: the capsule is back to its checkpointed state.");
} finally {
  // Reclaim the checkpoint's stored bytes, then the machine. Storage is metered while held.
  // Best effort: the capsule that took the checkpoint was destroyed by the rollback, so this
  // can answer 404. If it does, delete the snapshot from the dashboard under Storage.
  if (checkpointId) {
    await box.snapshots.delete(originalId, checkpointId).catch(() => {
      /* already gone, or the original capsule's record is no longer addressable */
    });
  }
  await box.destroy();
  console.log(`destroyed ${box.id}`);
}
