// @capsulate/sdk — the official Capsulate SDK.
//
// Launch and drive isolated cloud sandboxes (capsules) from JavaScript/TypeScript.
// This is the single client that powers the `cap` CLI, the MCP server, and your
// own agents — every action in the Capsulate dashboard is available here (§8 parity).

export { Capsulate } from "./client.js";
export type { CapsulateOptions } from "./client.js";
export { Capsule } from "./capsule.js";
export { Browser, browserCall } from "./browser.js";
export type { BrowserTarget, BrowserElement, BrowserPage, BrowserSnapshot, BrowserTab, BrowserResult } from "./browser.js";
export { runActions } from "./actions.js";
export type { RunStep, RunObserve, RunStepResult, RunStopReason, RunActionsResult } from "./actions.js";
export { CapsulateError, CapsulateAuthError } from "./errors.js";
export { encodeBase64, decodeBase64 } from "./internal.js";

export type * from "./types.js";

// Resource classes are exported for advanced typing; instantiate via `new Capsulate(...)`.
export { Capsules } from "./resources/capsules.js";
export { Volumes } from "./resources/volumes.js";
export { Recordings, TeamRecordings } from "./resources/recordings.js";
export { Snapshots } from "./resources/snapshots.js";
export { Sharing, Ports } from "./resources/sharing.js";
export { Catalog, Bundles, Templates } from "./resources/catalog.js";
export { Teams, Billing, ApiKeys } from "./resources/account.js";
export { Demos } from "./resources/demos.js";
