// Best-effort "open this URL in the user's default browser". No dependency: we spawn
// the platform opener (start / open / xdg-open) detached and never fail the command
// if it is missing (headless boxes, containers) - the caller always prints the URL too.

import { spawn } from "node:child_process";

export function openUrl(url: string): boolean {
  try {
    const platform = process.platform;
    const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
    // `start` treats the first quoted argument as a window title, hence the empty "".
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    // A missing opener surfaces as an async 'error' event; swallow it so it can't crash us.
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
