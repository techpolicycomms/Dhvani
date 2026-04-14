import { promises as fs } from "node:fs";
import path from "node:path";
import { WHISPER_PRICE_PER_MINUTE } from "./constants";

/**
 * Append-only JSONL usage log.
 *
 * Each line is a self-contained JSON record of one transcribed chunk.
 * Keeping the format flat (no nested objects) makes it trivial to stream
 * with `tail -f` or import into a spreadsheet.
 *
 * v1 uses a local file (USAGE_LOG_PATH, default ./data/usage-log.jsonl).
 * The admin dashboard reads and aggregates it. Swap to a database later
 * without touching the API surface: same record shape.
 */

export type UsageRecord = {
  userId: string;
  email: string;
  name: string | null;
  timestamp: string; // ISO8601
  audioDurationSeconds: number;
  whisperCost: number;
  chunkId: string;
};

function logPath(): string {
  return process.env.USAGE_LOG_PATH || path.join(process.cwd(), "data", "usage-log.jsonl");
}

/**
 * Append a single record to the log, creating the parent directory if
 * necessary. Failures are logged but not re-thrown — losing a usage
 * record should never cause a transcription to fail.
 */
export async function logUsage(rec: UsageRecord): Promise<void> {
  try {
    const p = logPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify(rec) + "\n", "utf8");
  } catch (err) {
    console.warn("dhvani: failed to append usage log", err);
  }
}

/**
 * Read and parse every record from the log. Swallows malformed lines.
 */
export async function readAllUsage(): Promise<UsageRecord[]> {
  try {
    const p = logPath();
    const content = await fs.readFile(p, "utf8");
    const out: UsageRecord[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        /* ignore malformed line */
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function costFromSeconds(seconds: number): number {
  return (seconds / 60) * WHISPER_PRICE_PER_MINUTE;
}
