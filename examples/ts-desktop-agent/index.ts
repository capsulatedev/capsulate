// A desktop agent loop with the SDK: launch a Linux desktop, find a control by its real name
// through the accessibility tree, act, verify, checkpoint before a risky step, roll back.
//
//   npm i @capsulate/sdk
//   CAPSULATE_API_KEY=cap_live_... npx tsx index.ts
import { Capsulate } from "@capsulate/sdk";

const cap = new Capsulate({ apiKey: process.env.CAPSULATE_API_KEY });

const box = await cap.capsules.launch({ template: "ubuntu-desktop", size: "1c2g" });
await box.waitUntilActive();
console.log("capsule", box.id, "active");

// Read the UI as a tree of named controls, not pixels.
const tree = await box.uiTree({ maxDepth: 3, interesting: true });
console.log("top-level windows:", (await box.windowList()).windows?.map((w) => w.title));

// Save the whole machine before doing anything risky.
const cp = await box.checkpoint("before-changes");

// Find, act, verify: clicks the control named "Applications" and confirms the state changed.
const clicked = await box.findAndClick({ name: "Applications" });
console.log("clicked", clicked.name);

// Undo everything the agent did since the checkpoint.
await box.rollback(cp.id);
console.log("rolled back to", cp.name, "tree size was", tree.nodes?.length);

await box.destroy();
