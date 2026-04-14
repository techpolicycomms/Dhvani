import { formatSrtTimestamp, parseElapsed } from "./audioUtils";
import type { TranscriptEntry } from "./constants";

/**
 * Render the transcript as a plain-text document with timestamps.
 */
export function toTxt(transcript: TranscriptEntry[]): string {
  return transcript.map((e) => `[${e.timestamp}] ${e.text}`).join("\n");
}

/**
 * Render the transcript as an SRT subtitle file. Each entry is given a
 * 4-second display window (best-effort — Whisper chunks don't contain
 * per-word offsets via this endpoint).
 */
export function toSrt(transcript: TranscriptEntry[], chunkDurationMs = 5000): string {
  return transcript
    .map((entry, i) => {
      const startMs = parseElapsed(entry.timestamp);
      const endMs = startMs + chunkDurationMs;
      return [
        String(i + 1),
        `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`,
        entry.text,
        "",
      ].join("\n");
    })
    .join("\n");
}

/**
 * Render the transcript as pretty-printed JSON.
 */
export function toJson(transcript: TranscriptEntry[]): string {
  return JSON.stringify(
    transcript.map((e) => ({ id: e.id, timestamp: e.timestamp, text: e.text })),
    null,
    2
  );
}

/**
 * Build a filename like "dhvani-transcript-2026-04-14.txt".
 */
export function buildFilename(extension: string): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
  return `dhvani-transcript-${date}.${extension}`;
}

/**
 * Trigger a browser download of the given text content.
 */
export function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
