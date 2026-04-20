import { formatSrtTimestamp, parseElapsed } from "./audioUtils";
import type { TranscriptEntry } from "./constants";
import { DISCLAIMER_FULL } from "./disclaimer";

/**
 * Resolver for turning a raw speaker id into a display name (honouring
 * the user's rename map). Exports accept this as a dependency so pages
 * can pass the same resolver used by the TranscriptPanel.
 */
export type SpeakerResolver = (
  rawSpeaker: string | undefined
) => string | undefined;

function displayFor(entry: TranscriptEntry, resolve?: SpeakerResolver): string | undefined {
  if (resolve) return resolve(entry.rawSpeaker);
  return entry.speaker;
}

/**
 * Render the transcript as a plain-text document with timestamps and
 * speaker labels (when present).
 *
 *   [00:01:22] Speaker 1: The primary concern relates to…
 */
export function toTxt(
  transcript: TranscriptEntry[],
  resolve?: SpeakerResolver
): string {
  const body = transcript
    .map((e) => {
      const speaker = displayFor(e, resolve);
      return speaker
        ? `[${e.timestamp}] ${speaker}: ${e.text}`
        : `[${e.timestamp}] ${e.text}`;
    })
    .join("\n");
  return `${body}\n\n---\nDisclaimer: ${DISCLAIMER_FULL}\n`;
}

/**
 * Render the transcript as an SRT subtitle file. Each entry is given a
 * 4-second display window (best-effort — the diarizer returns per-segment
 * offsets but SRT cues here still tile at the entry granularity). Speaker
 * name, when present, is prepended in square brackets.
 */
export function toSrt(
  transcript: TranscriptEntry[],
  resolve?: SpeakerResolver,
  chunkDurationMs = 5000
): string {
  return transcript
    .map((entry, i) => {
      const startMs = parseElapsed(entry.timestamp);
      const endMs = startMs + chunkDurationMs;
      const speaker = displayFor(entry, resolve);
      const body = speaker ? `[${speaker}] ${entry.text}` : entry.text;
      return [
        String(i + 1),
        `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`,
        body,
        "",
      ].join("\n");
    })
    .join("\n");
}

/**
 * Render the transcript as pretty-printed JSON, including the resolved
 * speaker label (if any) and the raw diarizer id for downstream tools.
 */
export function toJson(
  transcript: TranscriptEntry[],
  resolve?: SpeakerResolver
): string {
  const entries = transcript.map((e) => {
    const speaker = displayFor(e, resolve);
    return {
      id: e.id,
      timestamp: e.timestamp,
      ...(speaker ? { speaker } : {}),
      ...(e.rawSpeaker ? { rawSpeaker: e.rawSpeaker } : {}),
      text: e.text,
    };
  });
  return JSON.stringify(
    {
      disclaimer: DISCLAIMER_FULL,
      generatedAt: new Date().toISOString(),
      entries,
    },
    null,
    2
  );
}

/**
 * D4 — Markdown export with timestamp anchors. Pastes cleanly into
 * Obsidian, Notion, Bear, etc. Title + recap are appended by the caller
 * when they have access to that data.
 *
 *   # Meeting title
 *   *Date · Duration*
 *
 *   ## Transcript
 *   **[10:23:15]** **Speaker 1:** So the way I see it…
 */
export function toMarkdown(
  transcript: TranscriptEntry[],
  resolve?: SpeakerResolver,
  opts?: { title?: string; durationMin?: number }
): string {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString();
  if (opts?.title) {
    lines.push(`# ${opts.title}`);
    const meta = opts.durationMin
      ? `*${date} · ${opts.durationMin.toFixed(0)} min*`
      : `*${date}*`;
    lines.push(meta, "", "## Transcript", "");
  }
  for (const e of transcript) {
    const speaker = displayFor(e, resolve);
    const head = speaker
      ? `**[${e.timestamp}]** **${speaker}:**`
      : `**[${e.timestamp}]**`;
    lines.push(`${head} ${e.text}`, "");
  }
  lines.push("", "---", "", `> **Disclaimer.** ${DISCLAIMER_FULL}`);
  return lines.join("\n").trim();
}

/**
 * Build a filename. Mode-aware: Personal mode produces a humble
 * `recap-2026-04-14.txt`, Power mode the institutional
 * `ITU-Meeting-Notes-2026-04-14.txt`. Falls back to the legacy
 * `dhvani-transcript-…` shape when no mode is supplied (backwards
 * compatibility for callers that haven't been threaded through).
 */
export function buildFilename(
  extension: string,
  opts?: { mode?: "personal" | "power"; title?: string }
): string {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
  if (!opts?.mode) {
    return `dhvani-transcript-${date}.${extension}`;
  }
  const slug = (opts.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const prefix = opts.mode === "power" ? "ITU-Meeting-Notes" : "recap";
  const base = slug ? `${prefix}-${slug}-${date}` : `${prefix}-${date}`;
  return `${base}.${extension}`;
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
