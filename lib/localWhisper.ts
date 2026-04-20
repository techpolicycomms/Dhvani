/**
 * Client-side (local) Whisper transcription.
 *
 * Used by the "Microphone" capture mode, which is effectively a
 * private voice memo — one speaker, no need for diarization, and the
 * strong product case for doing the work on-device:
 *
 *   - No audio ever leaves the browser. Sensitive content stays put.
 *   - Zero Azure cost per minute.
 *   - Works offline after the first model download.
 *
 * The "Meeting" capture modes (tab-audio, electron system audio,
 * virtual-cable) keep using the Azure `gpt-4o-transcribe-diarize`
 * deployment via `/api/transcribe` because diarization is worth the
 * per-minute cost when there are multiple speakers.
 *
 * Runtime: `@xenova/transformers` exposes the Whisper family as ONNX
 * models runnable in-browser via `onnxruntime-web`. This is the same
 * dependency already used by the voice embedder, so no new bundles.
 * The Xenova/whisper-base model weights are quantised to ~140 MB and
 * cached in IndexedDB after the first download, matching the UX
 * pattern we already set for voice embeddings.
 *
 * A native whisper.cpp binary is a faster future option for the
 * Electron build (main-process spawn + IPC) — logged in
 * docs/ARCHITECTURE.md. Same model family, same result type, so the
 * switch is a drop-in at the `transcribeLocal` call site.
 */

"use client";

import type {
  TranscriptionResult,
  TranscriptionSegment,
} from "./providers/ai";

type AsrPipeline = (
  input: Float32Array,
  options?: Record<string, unknown>
) => Promise<AsrResult>;

type AsrChunk = {
  text?: string;
  timestamp?: [number | null, number | null];
};

type AsrResult = {
  text?: string;
  chunks?: AsrChunk[];
};

type TransformersEnv = {
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  backends?: {
    onnx?: {
      wasm?: { numThreads?: number };
    };
  };
};

/**
 * Available Whisper sizes (Xenova ports, quantised). Larger = more
 * accurate + more memory + slower. The default `base` is the sweet
 * spot for mic-mode voice memos: ~140 MB download, ~3× realtime on
 * a 2023 MacBook Air, very usable on mid-range Android.
 */
export type LocalWhisperSize = "tiny" | "base" | "small";

const MODEL_IDS: Record<LocalWhisperSize, string> = {
  tiny: "Xenova/whisper-tiny",
  base: "Xenova/whisper-base",
  small: "Xenova/whisper-small",
};

// Minimum duration we'll try to transcribe — below this the ASR
// model returns mostly noise.
const MIN_SAMPLES_16K = 16000 * 0.4;

let currentSize: LocalWhisperSize = "base";
let transcriberPromise: Promise<AsrPipeline> | null = null;
let transcriberForSize: LocalWhisperSize | null = null;

async function loadTranscriber(
  size: LocalWhisperSize
): Promise<AsrPipeline> {
  if (transcriberPromise && transcriberForSize === size) {
    return transcriberPromise;
  }
  transcriberPromise = null;
  transcriberForSize = size;
  transcriberPromise = (async () => {
    const mod = (await import("@xenova/transformers")) as unknown as {
      pipeline: (
        task: string,
        model: string,
        options?: Record<string, unknown>
      ) => Promise<AsrPipeline>;
      env: TransformersEnv;
    };
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    // Multi-threaded WASM requires cross-origin isolation (COEP/COOP
    // headers) which most Next.js dev servers don't have. Force the
    // single-threaded backend so load doesn't crash.
    if (mod.env.backends?.onnx?.wasm) {
      mod.env.backends.onnx.wasm.numThreads = 1;
    }
    return mod.pipeline(
      "automatic-speech-recognition",
      MODEL_IDS[size],
      { quantized: true }
    );
  })();
  return transcriberPromise;
}

/**
 * Pick the model size for subsequent preload / transcribe calls.
 * Changing the size invalidates any in-flight model load.
 */
export function setLocalWhisperSize(size: LocalWhisperSize): void {
  if (size === currentSize) return;
  currentSize = size;
  transcriberPromise = null;
  transcriberForSize = null;
}

export function getLocalWhisperSize(): LocalWhisperSize {
  return currentSize;
}

/**
 * Kick off model download eagerly so the first chunk doesn't wait
 * for the full ~140 MB fetch. Safe to call multiple times. Errors
 * are swallowed and state reset so a later call can retry.
 */
export function preloadLocalWhisper(): void {
  void loadTranscriber(currentSize).catch((err) => {
    console.warn("[localWhisper] preload failed", err);
    transcriberPromise = null;
    transcriberForSize = null;
  });
}

/**
 * Transcribe a mono 16 kHz PCM buffer locally. Returns the same
 * shape as the Azure path (`providers/ai.ts`) so the downstream
 * pipeline (useTranscription, the transcript panel) doesn't care
 * which engine produced it.
 *
 * Every segment is tagged with a constant speaker id (`speaker_0`)
 * because mic-mode audio is single-speaker by definition. The
 * stitcher keeps this stable as `S1` across all chunks.
 */
export async function transcribeLocal(
  pcm16kMono: Float32Array,
  options: { language?: string } = {}
): Promise<TranscriptionResult> {
  if (pcm16kMono.length < MIN_SAMPLES_16K) {
    return { text: "", segments: [], language: options.language ?? null };
  }
  const transcriber = await loadTranscriber(currentSize);
  const result = await transcriber(pcm16kMono, {
    // Empty/undefined language → whisper auto-detects.
    language: options.language || undefined,
    task: "transcribe",
    return_timestamps: true,
    // 30 s is Whisper's native window; stride prevents word-chops at
    // boundaries when a chunk is longer than 30 s (shouldn't happen
    // with 6 s default MediaRecorder cycles but harmless).
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const rawChunks = Array.isArray(result.chunks) ? result.chunks : [];
  const segments: TranscriptionSegment[] = rawChunks
    .filter((c) => typeof c.text === "string" && (c.text ?? "").trim() !== "")
    .map((c) => ({
      speaker: "speaker_0",
      text: (c.text ?? "").trim(),
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
    }));

  // If return_timestamps didn't produce any segments but there IS a
  // `text` (very short clip, no word-level timestamps), emit one
  // synthetic segment spanning the full clip.
  if (segments.length === 0 && (result.text ?? "").trim()) {
    segments.push({
      speaker: "speaker_0",
      text: (result.text ?? "").trim(),
      start: 0,
      end: pcm16kMono.length / 16000,
    });
  }

  return {
    text: result.text ?? "",
    segments,
    language: options.language ?? null,
  };
}
