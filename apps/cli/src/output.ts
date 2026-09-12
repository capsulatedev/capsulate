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

export function fail(err: unknown): never {
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
  process.exit(1);
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

/** Truncate a string to n chars with an ellipsis. */
export function trunc(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
