// Azure OpenAI gpt-4o-transcribe-diarize pricing is billed through the
// Azure subscription. Until the exact rate is confirmed in Azure Cost
// Management, we estimate at the legacy Whisper rate of $0.006/minute
// ($0.36/hour). Pricing may differ from Whisper — verify in
// Azure Cost Management.
export const WHISPER_PRICE_PER_MINUTE = 0.006;

// Default chunk duration in milliseconds for the MediaRecorder rotation
// cycle. 1 s gives near-real-time appearance (first transcript entry
// typically lands within 2 s of first speech, accounting for the Azure
// OpenAI round-trip). The diarizer still has enough acoustic context
// at 1 s to hold speaker identity; shorter than that starts degrading
// speaker labels without meaningfully improving latency.
// Users can trade up to 15 s via the Settings slider when they care
// more about denser speaker tracking than latency.
export const DEFAULT_CHUNK_DURATION_MS = 1000;
export const MIN_CHUNK_DURATION_MS = 500;
export const MAX_CHUNK_DURATION_MS = 15000;

// Maximum number of concurrent requests sent to the Whisper API.
// Raised to 6 so 1 s chunks never block on queue depth — a typical
// meeting generates chunks at a rate the transcribe API fully
// absorbs at this concurrency, and Azure OpenAI deployments handle
// 6 concurrent with headroom below the default per-user quota.
export const MAX_CONCURRENT_TRANSCRIPTIONS = 6;

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
 * `rawSpeaker` is the id returned by the diarizer (e.g. `"speaker_0"`).
 * `speaker` is the *default* display label at creation time
 * (e.g. `"Speaker 1"`). The live display resolves through the rename
 * map in useTranscriptStore, so renaming a speaker doesn't require
 * mutating every entry.
 *
 * Both fields are optional: when the transcription response lacks
 * diarization segments (fallback path), entries have no speaker.
 *
 * NOTE: diarizer speaker ids are scoped to a single audio request. Ids
 * across separate /api/transcribe calls are NOT correlated — same voice
 * may be `speaker_0` in one chunk and `speaker_1` in the next. The 1.5 s
 * default chunk trades some cross-chunk speaker stability for lower
 * latency; perfect stitching would require a persistent speaker
 * embedding we do not yet maintain.
 */
export type TranscriptEntry = {
  id: string;
  timestamp: string;
  text: string;
  rawSpeaker?: string;
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
 */
export function defaultSpeakerLabel(rawSpeaker: string): string {
  const m = /^speaker[_-]?(\d+)$/i.exec(rawSpeaker);
  if (m) return `Speaker ${parseInt(m[1], 10) + 1}`;
  // Unknown format — show the raw id so the user can still tell speakers apart.
  return rawSpeaker;
}

/**
 * Deterministic color for a speaker — index into SPEAKER_COLORS keyed
 * off the numeric suffix, falling back to a stable string hash.
 */
export function colorForSpeaker(rawSpeaker: string): string {
  const m = /^speaker[_-]?(\d+)$/i.exec(rawSpeaker);
  let idx = 0;
  if (m) {
    idx = parseInt(m[1], 10);
  } else {
    // djb2-ish hash for unknown ids.
    let h = 0;
    for (let i = 0; i < rawSpeaker.length; i++) {
      h = (h * 31 + rawSpeaker.charCodeAt(i)) | 0;
    }
    idx = Math.abs(h);
  }
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}
