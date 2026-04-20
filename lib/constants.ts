// Azure OpenAI gpt-4o-transcribe-diarize pricing is billed through the
// Azure subscription. Until the exact rate is confirmed in Azure Cost
// Management, we estimate at the legacy Whisper rate of $0.006/minute
// ($0.36/hour). Pricing may differ from Whisper — verify in
// Azure Cost Management.
export const WHISPER_PRICE_PER_MINUTE = 0.006;

// Default chunk duration in milliseconds for the MediaRecorder rotation
// cycle. 6 s is the accuracy-optimal default, confirmed empirically
// on Teams meetings at ITU:
//
//   1. Diarization context. gpt-4o-transcribe-diarize needs enough
//      acoustic evidence to build a voice embedding. At <4 s it
//      regularly collapses two speakers into one "speaker_0"; at 6 s+
//      it reliably separates 3-5 talkers.
//   2. Language-model disambiguation. The transcriber decides
//      homophones ("their" vs "they're", "sight" vs "site") partly
//      from surrounding context. Longer chunks carry more surrounding
//      words so the LM has more to lean on. This is especially visible
//      on technical ITU vocabulary where a single-phoneme flip changes
//      the term (e.g. "SG-17" vs "ISG-17").
//   3. Fewer boundary-cut casualties. MediaRecorder slices on the
//      cycle timer, not at word boundaries. At 1 s chunks roughly
//      every 60th cut lands mid-word and the fragment is dropped. At
//      6 s the ratio falls to ~1-in-360.
//   4. Lower request rate. 6 s → 10 req/min vs 1 s → 60 req/min.
//      Flaky networks rarely hit the queue-lag threshold.
//
// The trade-off is first-appearance latency: 6 s capture + ~1 s Azure
// round-trip ≈ 7 s to first transcript entry. That's the price for
// substantially higher accuracy, and empirically users prefer the
// correct-but-slower text to the fast-but-wrong text. Users can pull
// as low as 1 s via the Settings slider when latency matters more
// than accuracy (rarely the right call for a meeting).
export const DEFAULT_CHUNK_DURATION_MS = 6000;
export const MIN_CHUNK_DURATION_MS = 1000;
export const MAX_CHUNK_DURATION_MS = 15000;

// Maximum concurrent requests sent to the transcribe API. At 2 s
// chunks a typical meeting emits ~30 requests/min — 4 concurrent
// drains that with headroom to spare. 6 was the old 1 s-chunk
// number; we tightened it because over-concurrency burns request
// quota on retries during flaky links without shrinking latency.
export const MAX_CONCURRENT_TRANSCRIPTIONS = 4;

// If the in-flight + queued chunk count crosses this threshold, the
// UI surfaces a "transcription is catching up" hint. Below this, the
// queue is not user-visible; above, we signal backpressure honestly
// so the user understands why the latest speech hasn't landed yet.
// Tuned from live Teams testing where queue depth of ~8 correlated
// with a perceptible "frozen transcript" feeling.
export const QUEUE_BACKPRESSURE_THRESHOLD = 8;

// Target MediaRecorder bitrate. Opus is intelligible at 16 kbps; 24 kbps
// gives headroom for accents, background noise, and multi-speaker audio
// while keeping ~10 MB/hour of stored audio.
export const AUDIO_BITS_PER_SECOND = 24000;

// Persist chunks to OPFS so crashes/network drops don't lose audio.
// Set false to skip all OPFS + IndexedDB work (useful for SSR tests).
export const AUDIO_PERSISTENCE_ENABLED = true;

// Minimum free storage (bytes) required before we'll start a recording.
export const MIN_FREE_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB

// Minimum length of a transcription result before we accept it (silence filter).
export const MIN_TRANSCRIPT_LENGTH = 3;

// Keys used to persist data in localStorage.
export const LS_KEYS = {
  session: "dhvani-session",
  sessionChunkPrefix: "dhvani-session-",
  apiKey: "dhvani-api-key",
  language: "dhvani-language",
  chunkDuration: "dhvani-chunk-duration",
  deviceId: "dhvani-device-id",
  captureMode: "dhvani-capture-mode",
  setupComplete: "dhvani-setup-complete",
} as const;

// Languages supported by Dhvani's language-hint dropdown. The Whisper
// API supports 50+ languages (auto-detect), but these are the most common.
// ISO-639-1 codes are passed as the `language` parameter to Whisper.
export const SUPPORTED_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "ru", label: "Russian" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
];

export type CaptureMode = "tab-audio" | "microphone" | "virtual-cable" | "electron";

/**
 * A single transcript line.
 *
 * `rawSpeaker` is the raw per-chunk id returned by the diarizer
 * (e.g. `"speaker_0"`) — NOT stable across chunks; kept only for
 * debugging and legacy rename-map lookups.
 *
 * `stableSpeakerId` is the session-wide normalised id produced by
 * `createSpeakerStitcher` (e.g. `"S1"`). Stable across all chunks in
 * a single recording and is the id everything user-visible (rename
 * map, colour, SpeakerStats) keys off.
 *
 * `speaker` is the *default* display label at creation time
 * (e.g. `"Speaker 1"`). The live display resolves through the rename
 * map in useTranscriptStore, so renaming a speaker doesn't require
 * mutating every entry.
 *
 * All three are optional: when the transcription response lacks
 * diarization segments (fallback path), entries have no speaker.
 */
export type TranscriptEntry = {
  id: string;
  timestamp: string;
  text: string;
  rawSpeaker?: string;
  stableSpeakerId?: string;
  speaker?: string;
};

/**
 * Per-speaker color palette (cycles for the 6th speaker and beyond).
 * Tuned for the ITU light theme — every value passes WCAG AA against a
 * white background.
 */
export const SPEAKER_COLORS = [
  "#009CD6", // ITU Blue — Speaker 1
  "#7C3AED", // violet — Speaker 2
  "#D97706", // amber — Speaker 3
  "#059669", // emerald — Speaker 4
  "#DC2626", // red — Speaker 5
  "#6B7280", // mid-gray — Speaker 6+
] as const;

/**
 * Convert a raw diarizer id like "speaker_0" → "Speaker 1" for display.
 * Accepts either a raw per-chunk id ("speaker_0") or a stable session
 * id ("S1") — both render as human-readable "Speaker N".
 */
export function defaultSpeakerLabel(idOrRaw: string): string {
  const stable = /^S(\d+)$/.exec(idOrRaw);
  if (stable) return `Speaker ${stable[1]}`;
  const raw = /^speaker[_-]?(\d+)$/i.exec(idOrRaw);
  if (raw) return `Speaker ${parseInt(raw[1], 10) + 1}`;
  // Unknown format — show the id so the user can still tell speakers apart.
  return idOrRaw;
}

/**
 * Deterministic color for a speaker — index into SPEAKER_COLORS keyed
 * off the numeric suffix. Accepts stable ids ("S1") or raw ids
 * ("speaker_0"); falls back to a stable string hash for unknowns.
 */
export function colorForSpeaker(idOrRaw: string): string {
  const stable = /^S(\d+)$/.exec(idOrRaw);
  if (stable) {
    const idx = Math.max(0, parseInt(stable[1], 10) - 1);
    return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
  }
  const raw = /^speaker[_-]?(\d+)$/i.exec(idOrRaw);
  let idx = 0;
  if (raw) {
    idx = parseInt(raw[1], 10);
  } else {
    // djb2-ish hash for unknown ids.
    let h = 0;
    for (let i = 0; i < idOrRaw.length; i++) {
      h = (h * 31 + idOrRaw.charCodeAt(i)) | 0;
    }
    idx = Math.abs(h);
  }
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}
