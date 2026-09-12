import type { Http } from "./http.js";

/** Shared context handed to every resource: the transport + a lazy team resolver. */
export interface ClientContext {
  http: Http;
  /** Resolve a team id: the explicit arg, else the configured team, else the user's first team. */
  resolveTeamId(explicit?: string): Promise<string>;
}

/** Base64-encode a UTF-8 string (binary-safe, works in Node and browsers). */
export function encodeBase64(text: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf-8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Decode base64 to a UTF-8 string. */
export function decodeBase64(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
