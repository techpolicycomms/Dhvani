/**
 * Format milliseconds as HH:MM:SS (omits hours for <1h durations).
 */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Format milliseconds as HH:MM:SS,mmm (SRT timestamp format).
 */
export function formatSrtTimestamp(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}

/**
 * Pick the best supported MediaRecorder mimeType with a graceful fallback chain.
 */
export function pickSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mimeType: "audio/webm", extension: "webm" };
  }
  const candidates: Array<{ mimeType: string; extension: string }> = [
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    { mimeType: "audio/mp4", extension: "mp4" },
    { mimeType: "audio/ogg;codecs=opus", extension: "ogg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  // Last resort — browser should pick its default.
  return { mimeType: "", extension: "webm" };
}

/**
 * Convert a recorded Blob into a File with a filename Whisper will accept.
 * Whisper infers format from the filename's extension, so pick carefully.
 */
export function blobToFile(blob: Blob, extension: string, index: number): File {
  const name = `chunk-${Date.now()}-${index}.${extension}`;
  return new File([blob], name, { type: blob.type || `audio/${extension}` });
}

/**
 * Parse an elapsed HH:MM:SS or MM:SS string back into milliseconds.
 */
export function parseElapsed(timestamp: string): number {
  const parts = timestamp.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  return 0;
}
