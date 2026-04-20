/**
 * Client-side speaker diarization for local-Whisper transcripts.
 *
 * Azure's `gpt-4o-transcribe-diarize` returns segments already tagged
 * with `speaker_0`, `speaker_1` etc. — the cloud path runs those
 * through the voice-embedding stitcher to get session-stable ids.
 *
 * Local Whisper returns segments with timestamps but **no speaker**.
 * So for the on-device in-person-conversation path we diarize here:
 *
 *   1. For each Whisper segment, slice the underlying PCM by its
 *      [start, end] timestamps.
 *   2. Run the slice through the voice embedder (same model used by
 *      the cloud stitcher).
 *   3. Pipe the embeddings into the embedding stitcher with a
 *      single synthetic rawSpeaker per segment ("w0", "w1", …) so
 *      each segment is an independent cluster candidate. The
 *      stitcher does the clustering work — cosine similarity vs.
 *      running centroids with threshold match — and returns a
 *      session-stable id per segment.
 *
 * This is chunk-level diarization, not turn-detection — if a single
 * Whisper segment spans two speakers, both are treated as one. Good
 * enough for natural turn-taking conversations (typical bilateral
 * meeting). A VAD + speaker-change-detection refinement is a future
 * step (see docs/ARCHITECTURE.md).
 */

"use client";

import { decodeChunkToPcm, slicePcm } from "./audioDecode";
import { embedVoice } from "./voiceEmbedder";
import type {
  EmbeddingStitcher,
  SpeakerEmbeddingInput,
} from "./embeddingStitcher";
import type { TranscriptionSegment } from "./providers/ai";

export type DiarizedSegment = TranscriptionSegment & {
  stableSpeakerId: string;
};

/**
 * Diarize a set of Whisper segments that came from the given Blob.
 * Returns the same segments annotated with a session-stable speaker
 * id; segments whose embedding couldn't be computed (too short,
 * decode failure) fall back to "S1" so the transcript always has
 * a speaker label.
 *
 * `stitcher` is the session-scoped EmbeddingStitcher instance —
 * callers typically share one with the cloud pipeline so speaker
 * ids stay consistent even if the user switches between in-person
 * (local) and online-meeting (cloud) mid-session.
 */
export async function diarizeLocalSegments(
  blob: Blob,
  segments: TranscriptionSegment[],
  stitcher: EmbeddingStitcher
): Promise<DiarizedSegment[]> {
  if (segments.length === 0) return [];
  const decoded = await decodeChunkToPcm(blob).catch(() => null);
  if (!decoded) {
    // Decode failed — label everything as S1 and move on.
    return segments.map((s) => ({ ...s, stableSpeakerId: "S1" }));
  }

  // Build one embedding per Whisper segment. Use a unique
  // chunk-local raw id per segment ("w0", "w1", …) so the stitcher
  // treats each as an independent cluster candidate rather than
  // collapsing them all into one shared centroid update.
  const inputs: SpeakerEmbeddingInput[] = await Promise.all(
    segments.map(async (seg, i) => {
      const slice = slicePcm(decoded.pcm, decoded.sampleRate, seg.start, seg.end);
      const embedding = slice.length > 0 ? await embedVoice(slice).catch(() => null) : null;
      return { rawSpeaker: `w${i}`, embedding };
    })
  );
  const { mapping } = stitcher.ingest(inputs);

  return segments.map((seg, i) => {
    const stableId = mapping.get(`w${i}`) ?? "S1";
    return { ...seg, stableSpeakerId: stableId, speaker: stableId };
  });
}
