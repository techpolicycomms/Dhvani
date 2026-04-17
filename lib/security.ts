/**
 * Dhvani security helpers.
 *
 * Centralised so route handlers and storage modules share one definition
 * of "safe". Everything exported here is defence-in-depth: the primary
 * controls are already the NextAuth session gate and the fact that user
 * ids are Entra-issued UUIDs. These helpers catch mistakes (misspelled
 * user ids, stray path chars, unescaped regex queries) before they
 * become vulnerabilities.
 */

import path from "node:path";

/**
 * Drops every character that isn't alphanumeric, dash, underscore, dot,
 * or `@`. Safe to use on user ids, session ids, and other stable
 * identifiers. Never use on free-text input — it silently munges
 * anything it doesn't like.
 *
 * The allowed set matches `SAFE_ID` in `lib/transcriptStorage.ts` so
 * inbound user ids sanitise consistently regardless of entry point.
 */
export function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_\-@.]/g, "");
}

/**
 * Verify `filePath` resolves inside `baseDir`. Returns false for any
 * resolved path that escapes (`../../etc/passwd`, absolute paths,
 * symlinks already followed by the OS at resolve time).
 */
export function ensureWithinDir(filePath: string, baseDir: string): boolean {
  const resolved = path.resolve(filePath);
  const base = path.resolve(baseDir);
  return resolved === base || resolved.startsWith(base + path.sep);
}

/**
 * Escape a user-supplied string for embedding in a RegExp. Required
 * anywhere we build a RegExp from `req.query` / `req.body` content
 * (e.g. search highlight) — otherwise a user can inject `.*` and DoS
 * the regex engine or pull structural characters into the pattern.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Structured security event log — one line per event, grep-friendly
 * prefix, never includes the audio payload or the transcript text.
 * Consume in production with whatever log sink is in front of Azure
 * Web Apps (App Insights, Log Analytics).
 */
export type SecurityEventType =
  | "auth_failure"
  | "rate_limit"
  | "path_traversal"
  | "invalid_input"
  | "upload_rejected"
  | "forbidden";

export function logSecurityEvent(event: {
  type: SecurityEventType;
  userId?: string;
  ip?: string;
  details: string;
}): void {
  console.warn(
    `[SECURITY] ${event.type}: ${event.details}`,
    JSON.stringify({
      userId: event.userId || "anonymous",
      ip: event.ip,
      timestamp: new Date().toISOString(),
    })
  );
}
