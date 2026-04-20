/**
 * Client-side voice embedder.
 *
 * Produces a fixed-length speaker embedding (a voice "fingerprint")
 * for a slice of PCM audio, used by the embedding stitcher to
 * recognise the same voice across a meeting even when separated by
 * long silences. Runs entirely in-browser via transformers.js; no
 * audio leaves the device.
 *
 * Model choice: `Xenova/wav2vec2-base-voxceleb1-speaker-verification`
 * — a wav2vec2 encoder fine-tuned on VoxCeleb1 for speaker
 * verification. Input is 16 kHz mono PCM; output is a 512-d
 * embedding (we L2-normalise + average-pool mean). ~90 MB ONNX
 * model cached in the browser after first use; ~200–500 ms
 * inference per 3s clip on a 2023-era laptop. Acceptable for
 * meeting-latency budgets.
 *
 * Loading is lazy + memoised — the first recording pays the model
 * download, subsequent ones use the cached copy. If the model fails
 * to load (network, CSP, old browser) the exported helpers throw and
 * the caller is expected to fall back to the time-adjacency stitcher.
 */

"use client";

type FeaturePipeline = (
  input: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ data: Float32Array | ArrayLike<number>; dims?: number[] }>;

type TransformersEnv = {
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  backends?: {
    onnx?: {
      wasm?: { numThreads?: number };
    };
  };
};

// Voice-embedding model. wav2vec2-base fine-tuned for speaker
// verification on VoxCeleb1 — the most reliable transformers.js
// checkpoint for this task.
const MODEL_ID = "Xenova/wav2vec2-base-voxceleb1-speaker-verification";
// Minimum audio duration we'll embed. Shorter than ~0.6 s tends to
// produce unstable speaker vectors on wav2vec2.
const MIN_SAMPLES_FOR_EMBED_16K = 16000 * 0.6;

let extractorPromise: Promise<FeaturePipeline> | null = null;

async function loadExtractor(): Promise<FeaturePipeline> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    const mod = (await import("@xenova/transformers")) as unknown as {
      pipeline: (
        task: string,
        model: string,
        options?: Record<string, unknown>
      ) => Promise<FeaturePipeline>;
      env: TransformersEnv;
    };
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    // Multi-threaded WASM requires cross-origin isolation
    // (COEP/COOP headers). Force single-threaded so we don't crash
    // on a standard Next.js dev server.
    if (mod.env.backends?.onnx?.wasm) {
      mod.env.backends.onnx.wasm.numThreads = 1;
    }
    // `feature-extraction` is the correct task for getting a voice
    // fingerprint. `audio-classification` returns VoxCeleb1 class
    // logits which are useless as embeddings (they're scores over a
    // closed enrolled set, not a speaker-identity representation).
    return mod.pipeline("feature-extraction", MODEL_ID, {
      quantized: true,
    });
  })();
  return extractorPromise;
}

/**
 * Compute a voice embedding for a 16 kHz mono PCM slice. The
 * `feature-extraction` pipeline with pooling=mean + normalize=true
 * gives us an L2-normalised voice fingerprint in one call, which is
 * exactly what the embedding stitcher wants. Returns null when the
 * slice is too short to produce a stable embedding.
 */
export async function embedVoice(
  pcm16kMono: Float32Array
): Promise<Float32Array | null> {
  if (pcm16kMono.length < MIN_SAMPLES_FOR_EMBED_16K) return null;
  const extractor = await loadExtractor();
  const result = await extractor(pcm16kMono, {
    pooling: "mean",
    normalize: true,
  });
  const data =
    result.data instanceof Float32Array
      ? result.data
      : new Float32Array(Array.from(result.data));
  // Some backends leave a singleton batch dim on the output; squeeze
  // by flattening. The embedding is what it is regardless of dims.
  return data;
}

/**
 * Cosine similarity between two already-L2-normalised embeddings.
 * Falls back to the real formula when inputs aren't normalised.
 */
export function cosineSimilarity(
  a: Float32Array,
  b: Float32Array
): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom < 1e-9) return 0;
  return dot / denom;
}

/**
 * Kick off model download eagerly on the main thread. Call once on
 * "user pressed Start" so the 90 MB cache fill overlaps with the
 * first few chunks reaching the Azure server — by the time the first
 * chunk comes back with segments, the embedder is usually ready.
 * Safe to call multiple times; dedupes internally.
 */
export function preloadEmbedder(): void {
  void loadExtractor().catch((err) => {
    console.warn("[voiceEmbedder] preload failed", err);
    // Reset so a later call can retry.
    extractorPromise = null;
  });
}

/**
 * Incrementally update a running centroid with a new observation.
 * Mutates `centroid` in place and returns the new sample count.
 */
export function updateCentroid(
  centroid: Float32Array,
  samples: number,
  next: Float32Array
): number {
  const len = Math.min(centroid.length, next.length);
  const newCount = samples + 1;
  for (let i = 0; i < len; i++) {
    centroid[i] = (centroid[i] * samples + next[i]) / newCount;
  }
  // Re-normalise so cosine sim stays dot-product-equivalent.
  let norm = 0;
  for (let i = 0; i < len; i++) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < len; i++) centroid[i] /= norm;
  return newCount;
}
