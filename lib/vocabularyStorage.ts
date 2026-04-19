/**
 * Shared read path for user-level vocabulary entries.
 *
 * Extracted from /api/vocabulary so that /api/transcribe can pull the
 * user's terms to prime the transcription model without depending on
 * the route module (which owns the write path + auth surface).
 *
 * The on-disk shape is an array of `{ id, term, definition }` records;
 * the transcribe path only needs the term strings, so a dedicated
 * getter is exposed here.
 *
 * Errors are swallowed: if the file is unreadable the transcribe path
 * still works — it just loses the user's personal priming. Default ITU
 * vocabulary still applies (see lib/ituVocabulary.ts).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ensureWithinDir,
  logSecurityEvent,
  sanitizePathSegment,
} from "@/lib/security";

export type VocabEntry = {
  id: string;
  term: string;
  definition: string;
};

const DATA_DIR =
  process.env.DHVANI_DATA_DIR || path.join(process.cwd(), "data", "transcripts");
const VOCAB_DIR = path.join(DATA_DIR, "_vocabulary");

function vocabFile(userId: string): string | null {
  const safeId = sanitizePathSegment(userId);
  if (!safeId) return null;
  const p = path.join(VOCAB_DIR, `${safeId}.json`);
  if (!ensureWithinDir(p, VOCAB_DIR)) {
    logSecurityEvent({
      type: "path_traversal",
      userId,
      details: "vocabulary path outside VOCAB_DIR",
    });
    return null;
  }
  return p;
}

export async function readUserVocabEntries(
  userId: string
): Promise<VocabEntry[]> {
  const p = vocabFile(userId);
  if (!p) return [];
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VocabEntry[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

/** Flat list of term strings (definitions dropped). */
export async function readUserVocabularyTerms(userId: string): Promise<string[]> {
  const entries = await readUserVocabEntries(userId);
  return entries
    .map((e) => (typeof e.term === "string" ? e.term.trim() : ""))
    .filter((t) => t.length > 0);
}

export { vocabFile };
