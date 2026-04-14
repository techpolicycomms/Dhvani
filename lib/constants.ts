// Azure OpenAI Whisper pricing (as of 2024): $0.006 per minute of audio
// ($0.36/hour). Same rate as OpenAI's hosted API, billed via Azure.
export const WHISPER_PRICE_PER_MINUTE = 0.006;

// Default chunk duration in milliseconds for MediaRecorder timeslice.
export const DEFAULT_CHUNK_DURATION_MS = 5000;
export const MIN_CHUNK_DURATION_MS = 3000;
export const MAX_CHUNK_DURATION_MS = 15000;

// Maximum number of concurrent requests sent to the Whisper API.
export const MAX_CONCURRENT_TRANSCRIPTIONS = 2;

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

export type TranscriptEntry = {
  id: string;
  timestamp: string;
  text: string;
};
