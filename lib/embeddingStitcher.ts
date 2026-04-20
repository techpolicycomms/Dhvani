/**
 * Voice-embedding speaker stitcher.
 *
 * For each raw speaker present in a chunk, the caller computes a
 * voice embedding (see `lib/voiceEmbedder.ts`) and passes it in.
 * The stitcher maintains per-session centroids keyed by stable id
 * and assigns each raw embedding to either (a) the existing centroid
 * it's most similar to above `similarityThreshold`, or (b) a fresh
 * stable id when no match passes the threshold.
 *
 * Critically, this stitcher RECOGNISES THE SAME VOICE across long
 * silences — the thing pure time-adjacency cannot do. Alice speaks
 * for a minute, goes silent for 10 minutes, then talks again: the
 * embedder produces a vector close to Alice's centroid, cosine
 * similarity clears the threshold, and she keeps her stable id.
 *
 * Design parity with the time-adjacency stitcher: the external
 * `ingest(...) → { mapping }` shape is identical, so useTranscription
 * can swap between them without touching the transcript wiring.
 */

import {
  cosineSimilarity,
  updateCentroid,
} from "./voiceEmbedder";

export type SpeakerEmbeddingInput = {
  rawSpeaker: string;
  /**
   * Already L2-normalised voice embedding for this raw speaker's
   * audio in this chunk. May be null if the slice was too short to
   * embed reliably — the stitcher then falls back to a conservative
   * new-id allocation (same behaviour as time-stitcher bail-out).
   */
  embedding: Float32Array | null;
};

export type EmbeddingStitcherResult = {
  /** raw speaker id → session-stable id for this chunk. */
  mapping: Map<string, string>;
};

export type EmbeddingStitcher = {
  ingest: (inputs: SpeakerEmbeddingInput[]) => EmbeddingStitcherResult;
  reset: () => void;
  /**
   * Read-only snapshot of the per-raw → stable assignments made on
   * the **last** ingest call along with the cosine-similarity score
   * against the matched centroid. Used by the DHVANI_DEBUG_SPEAKERS
   * console logger to show WHY a given assignment was made.
   */
  lastDecisions: () => Array<{
    rawSpeaker: string;
    stableId: string;
    bestSim: number;
    matched: boolean;
  }>;
};

export type EmbeddingStitcherOptions = {
  /**
   * Cosine similarity threshold for matching a new embedding against
   * an existing centroid. Tuned empirically on VoxCeleb-style
   * wav2vec2 embeddings:
   *   - 0.80 is overly strict (splits the same speaker on bad mic
   *     conditions),
   *   - 0.60 merges similar-sounding voices,
   *   - 0.70 is the sweet spot for noisy Teams audio.
   */
  similarityThreshold?: number;
};

type Centroid = {
  stableId: string;
  vector: Float32Array;
  samples: number;
};

const DEFAULT_THRESHOLD = 0.7;

export function createEmbeddingStitcher(
  opts: EmbeddingStitcherOptions = {}
): EmbeddingStitcher {
  let threshold = opts.similarityThreshold ?? DEFAULT_THRESHOLD;
  let centroids: Centroid[] = [];
  let nextId = 1;
  let lastDecisionsBuf: Array<{
    rawSpeaker: string;
    stableId: string;
    bestSim: number;
    matched: boolean;
  }> = [];

  // Runtime override for the threshold via DevTools so we can tune
  // without rebuilding: `window.DHVANI_EMBED_THRESHOLD = 0.6`.
  const readThresholdOverride = (): number => {
    if (typeof window === "undefined") return threshold;
    const w = window as { DHVANI_EMBED_THRESHOLD?: number };
    if (typeof w.DHVANI_EMBED_THRESHOLD === "number") {
      return w.DHVANI_EMBED_THRESHOLD;
    }
    return threshold;
  };

  const allocate = (vec: Float32Array): string => {
    const stableId = `S${nextId++}`;
    centroids.push({ stableId, vector: vec.slice(), samples: 1 });
    return stableId;
  };

  const ingest = (
    inputs: SpeakerEmbeddingInput[]
  ): EmbeddingStitcherResult => {
    const mapping = new Map<string, string>();
    lastDecisionsBuf = [];
    if (inputs.length === 0) return { mapping };
    const activeThreshold = readThresholdOverride();

    // Score every raw × every centroid once. Also track the best
    // sim per input (even when below threshold) so diagnostics can
    // show "this speaker was closest to S1 @ 0.62, below threshold".
    type Candidate = {
      inputIdx: number;
      centroidIdx: number;
      sim: number;
    };
    const candidates: Candidate[] = [];
    const bestSimPerInput = new Map<number, { sim: number; stableId: string }>();
    for (let i = 0; i < inputs.length; i++) {
      const emb = inputs[i].embedding;
      if (!emb) continue;
      for (let c = 0; c < centroids.length; c++) {
        const sim = cosineSimilarity(emb, centroids[c].vector);
        const best = bestSimPerInput.get(i);
        if (!best || sim > best.sim) {
          bestSimPerInput.set(i, { sim, stableId: centroids[c].stableId });
        }
        if (sim >= activeThreshold) {
          candidates.push({ inputIdx: i, centroidIdx: c, sim });
        }
      }
    }
    candidates.sort((a, b) => b.sim - a.sim);

    const usedInputs = new Set<number>();
    const usedCentroids = new Set<number>();
    for (const cand of candidates) {
      if (usedInputs.has(cand.inputIdx)) continue;
      if (usedCentroids.has(cand.centroidIdx)) continue;
      const input = inputs[cand.inputIdx];
      const centroid = centroids[cand.centroidIdx];
      const emb = input.embedding;
      if (!emb) continue;
      mapping.set(input.rawSpeaker, centroid.stableId);
      centroid.samples = updateCentroid(
        centroid.vector,
        centroid.samples,
        emb
      );
      usedInputs.add(cand.inputIdx);
      usedCentroids.add(cand.centroidIdx);
      lastDecisionsBuf.push({
        rawSpeaker: input.rawSpeaker,
        stableId: centroid.stableId,
        bestSim: cand.sim,
        matched: true,
      });
    }

    // Unmatched inputs — allocate new stable ids for the ones that
    // had a real embedding, or fall back to a raw-keyed id when the
    // embedding was null (slice too short / decode failed).
    for (let i = 0; i < inputs.length; i++) {
      if (mapping.has(inputs[i].rawSpeaker)) continue;
      const emb = inputs[i].embedding;
      if (emb) {
        const newId = allocate(emb);
        mapping.set(inputs[i].rawSpeaker, newId);
        const best = bestSimPerInput.get(i);
        lastDecisionsBuf.push({
          rawSpeaker: inputs[i].rawSpeaker,
          stableId: newId,
          bestSim: best?.sim ?? 0,
          matched: false,
        });
      } else {
        const stableId = `S?${inputs[i].rawSpeaker}`;
        mapping.set(inputs[i].rawSpeaker, stableId);
        lastDecisionsBuf.push({
          rawSpeaker: inputs[i].rawSpeaker,
          stableId,
          bestSim: 0,
          matched: false,
        });
      }
    }

    return { mapping };
  };

  const reset = () => {
    centroids = [];
    nextId = 1;
    lastDecisionsBuf = [];
  };

  const lastDecisions = () => [...lastDecisionsBuf];

  return { ingest, reset, lastDecisions };
}
