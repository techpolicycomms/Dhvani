/**
 * Server-side persistence for saved transcripts.
 *
 * Layout:
 *   ./data/transcripts/<userId>/<sessionId>.json
 *
 * NOTE: this writes to the local filesystem of the running instance, so a
 * multi-replica deployment needs a shared volume (Azure Files, NFS, etc.)
 * for the path. The single-instance Web App we ship to today is fine.
 *
 * The README (and security model) explicitly used to say "no transcript
 * text is stored server-side". Saving transcripts is now a deliberate
 * feature, gated behind an explicit user click ("Save transcript" /
 * Auto-tag in the calendar prefs). It is per-user and not exposed to
 * other users — only the owner's own /api/transcripts list returns it.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { TranscriptEntry } from "./constants";
import type { Meeting } from "./calendar";

const DATA_DIR =
  process.env.DHVANI_DATA_DIR ||
  path.join(process.cwd(), "data", "transcripts");

export type SavedTranscriptMeta = {
  /** Stable random id assigned at save time. */
  id: string;
  /** Microsoft Graph object id of the owner. */
  userId: string;
  /** Optional human-readable title (defaults to meeting subject or date). */
  title: string;
  /** ISO timestamp when the recording started. */
  startedAt: string;
  /** ISO timestamp when the recording stopped. */
  endedAt: string;
  /** Total minutes recorded — drives cost estimate display. */
  durationMinutes: number;
  /** Number of audio chunks transcribed. */
  chunkCount: number;
  /** Estimated USD cost (sum of per-chunk costs). */
  estimatedCost: number;
  /** Calendar metadata if the session was started from a meeting card. */
  meeting?: Pick<
    Meeting,
    "id" | "subject" | "platform" | "start" | "end" | "organizer"
  >;
};

export type ActionItem = {
  task: string;
  assignee: string;
  dueDate: string | null;
  completed: boolean;
};

export type SavedTranscript = SavedTranscriptMeta & {
  /** Full transcript entries, in capture order. */
  entries: TranscriptEntry[];
  /** Custom speaker rename map at save time. */
  speakerNames?: Record<string, string>;
  /** AI-generated meeting summary (markdown). */
  summary?: string;
  /** Parsed action items from the summary. */
  actionItems?: ActionItem[];
};

/**
 * Userspace path-injection guard. Microsoft Graph object ids and our
 * generated session ids are alphanumeric + dashes; reject anything else
 * to keep `..`/slashes from escaping the data directory.
 */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

function userDir(userId: string): string {
  if (!SAFE_ID.test(userId)) {
    throw new Error("Invalid user id.");
  }
  return path.join(DATA_DIR, userId);
}

function fileFor(userId: string, id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error("Invalid transcript id.");
  }
  return path.join(userDir(userId), `${id}.json`);
}

export function newTranscriptId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export async function saveTranscript(
  userId: string,
  data: Omit<SavedTranscript, "userId">
): Promise<SavedTranscript> {
  const record: SavedTranscript = { ...data, userId };
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${record.id}.json.tmp`);
  const final = fileFor(userId, record.id);
  await fs.writeFile(tmp, JSON.stringify(record), "utf8");
  // Atomic replace so a partial write can never be read back.
  await fs.rename(tmp, final);
  return record;
}

export async function listTranscripts(
  userId: string
): Promise<SavedTranscriptMeta[]> {
  const dir = userDir(userId);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const items: SavedTranscriptMeta[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw) as SavedTranscript;
      // Strip the heavy entries[] for the list view.
      const { entries: _entries, speakerNames: _names, ...meta } = parsed;
      void _entries;
      void _names;
      items.push(meta);
    } catch {
      // Corrupt file — skip rather than 500 the whole list.
    }
  }
  // Newest first.
  items.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  return items;
}

export async function getTranscript(
  userId: string,
  id: string
): Promise<SavedTranscript | null> {
  try {
    const raw = await fs.readFile(fileFor(userId, id), "utf8");
    return JSON.parse(raw) as SavedTranscript;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteTranscript(
  userId: string,
  id: string
): Promise<boolean> {
  try {
    await fs.unlink(fileFor(userId, id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
