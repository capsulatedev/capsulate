// Output helpers — JSON mode for machines (--json), readable tables/lines for humans.

import { CapsulateError } from "@capsulate/sdk";

let jsonMode = false;
export function setJsonMode(on: boolean): void {
  jsonMode = on;
}
export function isJsonMode(): boolean {
  return jsonMode;
}

export function out(data: unknown): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    if (typeof data === "string") process.stdout.write(data + "\n");
    else process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

/** Print a result: JSON in --json mode, otherwise a human-friendly representation. */
export function result(data: unknown, human?: (d: any) => string): void {
  if (jsonMode || !human) {
    out(data);
    return;
  }
  process.stdout.write(human(data) + "\n");
}

export function info(msg: string): void {
  if (!jsonMode) process.stderr.write(msg + "\n");
}

export function success(msg: string): void {
  if (!jsonMode) process.stderr.write("✓ " + msg + "\n");
}

/**
 * Thrown to unwind out of a command once the exit code is set. Callers never need to
 * catch it: `fail()` passes it straight through and index.ts swallows it silently.
 */
export class ExitError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit ${code}`);
    this.name = "ExitError";
    this.code = code;
  }
}

/**
 * End the command with an exit code. We set process.exitCode and unwind instead of
 * calling process.exit(): on Windows with Node 24, process.exit() right after an HTTPS
 * request aborts the process with a libuv assertion (and exit code 127), which would turn
 * every clean "your key was rejected" message into a crash. Letting the event loop drain
 * exits with the same code, in the same fraction of a second.
 */
export function exitWith(code: number): never {
  process.exitCode = code;
  throw new ExitError(code);
}

export function fail(err: unknown): never {
  if (err instanceof ExitError) throw err;
  if (err instanceof CapsulateError) {
    if (jsonMode) {
      process.stdout.write(
        JSON.stringify({ error: err.message, status: err.status, body: err.body }, null, 2) + "\n",
      );
    } else {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.status) process.stderr.write(`  (HTTP ${err.status})\n`);
    }
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    if (jsonMode) process.stdout.write(JSON.stringify({ error: msg }, null, 2) + "\n");
    else process.stderr.write(`Error: ${msg}\n`);
  }
  return exitWith(1);
}

/** Render an array of rows as an aligned text table. */
export function table(rows: Array<Record<string, unknown>>, columns: string[]): string {
  if (rows.length === 0) return "(none)";
  const header = columns;
  const widths = header.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const body = rows.map((r) => line(header.map((c) => String(r[c] ?? ""))));
  return [line(header), sep, ...body].join("\n");
}

/** Human-readable byte count ("1.5 MB"). */
export function fmtBytes(n?: number): string {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

/** Truncate a string to n chars with an ellipsis. */
export function trunc(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
