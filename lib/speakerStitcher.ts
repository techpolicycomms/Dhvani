/**
 * Session-wide speaker stitcher.
 *
 * The diarizer (Azure gpt-4o-transcribe-diarize) assigns speaker ids
 * locally per /api/transcribe request. Ids do NOT carry across chunks,
 * so the same voice may be `speaker_0` in chunk 5 and `speaker_1` in
 * chunk 6. Displaying those raw ids produces a transcript where the
 * same person flicker-switches between "Speaker 1" and "Speaker 2".
 *
 * This module normalises raw per-chunk ids into **session-stable ids**
 * (`S1`, `S2`, …) using a time-adjacency heuristic: if speaker X's
 * first utterance in chunk N starts within `adjacencyGapMs` of some
 * known stable speaker's last-heard end time, X is probably that
 * same speaker continuing. Greedy one-to-one assignment; unmatched
 * raw ids allocate new stable ids.
 *
 * This is a honest stopgap — not voice biometrics. It fails when:
 *   - two speakers alternate faster than the gap threshold
 *   - a long silence (> gap) lands between two turns of the same person
 *   - speaker count differs across chunks
 *
 * The Sprint-2 replacement is client-side voice embedding (e.g.
 * speechbrain/spkrec-ecapa-voxceleb via @xenova/transformers) with
 * centroid-based clustering. This stitcher intentionally exposes a
 * small interface so the embedding-based variant can be dropped in
 * without touching useTranscription.
 */

export type RawSegment = {
  speaker: string;
  start: number; // seconds, relative to chunk start
  end: number; // seconds, relative to chunk start
};

export type StitcherResult = {
  /** Per-chunk mapping: raw speaker id → session-stable id (e.g. "S1"). */
  mapping: Map<string, string>;
};

export type SpeakerStitcher = {
  /**
   * Ingest a chunk's segments. Returns a mapping of rawSpeaker →
   * stableSpeakerId that the caller applies to that chunk's entries.
   * Safe to call in chunk-index order; tolerant of late/out-of-order
   * chunks (uses absolute wall-clock-relative timestamps rather than
   * chunk order).
   */
  ingest: (
    chunkIndex: number,
    chunkCapturedAtMs: number,
    segments: RawSegment[]
  ) => StitcherResult;
  /** Reset all state — call on new recording session. */
  reset: () => void;
};

type SpeakerState = {
  stableId: string;
  firstSeenMs: number;
  lastEndMs: number;
  totalMs: number;
};

export type StitcherOptions = {
  /**
   * Max gap (ms) for a strict adjacency match — "clearly the same
   * speaker continuing their turn". Default 1500ms. Shorter = less
   * risk of cross-matching two adjacent speakers.
   */
  strictGapMs?: number;
  /**
   * Max gap (ms) for a looser adjacency match — "same speaker after
   * a natural sentence-ending pause". Default 8000ms. Anything beyond
   * this is treated as "they stopped talking" and only the
   * single-speaker carry-over rule can still match.
   */
  looseGapMs?: number;
};

const DEFAULT_STRICT_GAP_MS = 1500;
const DEFAULT_LOOSE_GAP_MS = 8000;

export function createSpeakerStitcher(
  opts: StitcherOptions = {}
): SpeakerStitcher {
  const strictGapMs = opts.strictGapMs ?? DEFAULT_STRICT_GAP_MS;
  const looseGapMs = opts.looseGapMs ?? DEFAULT_LOOSE_GAP_MS;

  // Every stable speaker we've seen in this session.
  let known: SpeakerState[] = [];
  let nextId = 1;

  const allocateStableId = (): string => `S${nextId++}`;

  type RawAgg = {
    rawSpeaker: string;
    firstStartMs: number;
    lastEndMs: number;
    totalMs: number;
  };

  /** Greedy one-to-one match of unmapped raws to unused knowns within `gapMs`. */
  const matchWithinGap = (
    raws: RawAgg[],
    mapping: Map<string, string>,
    usedStable: Set<string>,
    gapMs: number
  ) => {
    for (const raw of raws) {
      if (mapping.has(raw.rawSpeaker)) continue;
      let best: SpeakerState | null = null;
      let bestGap = Infinity;
      for (const k of known) {
        if (usedStable.has(k.stableId)) continue;
        const gap = raw.firstStartMs - k.lastEndMs;
        // Allow tiny negatives (chunks can overlap by a few ms — the
        // diarizer's end-of-chunk boundary can bleed into the next
        // chunk's start).
        if (gap < -500) continue;
        if (gap > gapMs) continue;
        if (Math.abs(gap) < bestGap) {
          bestGap = Math.abs(gap);
          best = k;
        }
      }
      if (best) {
        mapping.set(raw.rawSpeaker, best.stableId);
        usedStable.add(best.stableId);
        if (raw.lastEndMs > best.lastEndMs) best.lastEndMs = raw.lastEndMs;
        best.totalMs += raw.totalMs;
      }
    }
  };

  const ingest = (
    _chunkIndex: number,
    chunkCapturedAtMs: number,
    segments: RawSegment[]
  ): StitcherResult => {
    const mapping = new Map<string, string>();
    if (segments.length === 0) return { mapping };

    // Aggregate this chunk's segments per raw speaker.
    const perRaw = new Map<string, RawAgg>();
    for (const seg of segments) {
      const startMs = chunkCapturedAtMs + seg.start * 1000;
      const endMs = chunkCapturedAtMs + seg.end * 1000;
      const existing = perRaw.get(seg.speaker);
      if (existing) {
        if (startMs < existing.firstStartMs) existing.firstStartMs = startMs;
        if (endMs > existing.lastEndMs) existing.lastEndMs = endMs;
        existing.totalMs += Math.max(0, endMs - startMs);
      } else {
        perRaw.set(seg.speaker, {
          rawSpeaker: seg.speaker,
          firstStartMs: startMs,
          lastEndMs: endMs,
          totalMs: Math.max(0, endMs - startMs),
        });
      }
    }

    // Earlier-starting raws pick matches first — important tiebreaker
    // when two raws in the same chunk score close to the same known.
    const rawsSorted = Array.from(perRaw.values()).sort(
      (a, b) => a.firstStartMs - b.firstStartMs
    );
    const usedStable = new Set<string>();

    // ---------------------------------------------------------------
    // Tier 1 — strict adjacency. Gap ≤ strictGapMs. "Continuous turn"
    // — same speaker's utterance straddled the chunk boundary. Always
    // safe.
    // ---------------------------------------------------------------
    matchWithinGap(rawsSorted, mapping, usedStable, strictGapMs);

    // ---------------------------------------------------------------
    // Tier 2 — loose adjacency. Gap ≤ looseGapMs. "Same speaker after
    // a natural pause". Only fires when there IS a multi-speaker
    // context to disambiguate against — either this chunk has ≥2
    // speakers, or the session history already has ≥2 known speakers.
    //
    // Why conditional: in the "Alice alone in chunk N, Bob alone in
    // chunk N+1" case (raws = 1, known = 1) a loose gap is unsafe —
    // time-adjacency alone can't tell "same person pausing" from
    // "different person taking over". When there are other speakers
    // in play the tie-break-by-smallest-gap rule becomes meaningful
    // because the RIGHT mapping is the one with the smaller |gap|.
    //
    // Single-speaker sessions will see a false SPLIT every time the
    // gap exceeds strictGapMs (user merges via the UI — one click).
    // That's the correct error to make: false split is visible and
    // reversible; false merge silently corrupts attribution.
    // ---------------------------------------------------------------
    if (rawsSorted.length > 1 || known.length > 1) {
      matchWithinGap(rawsSorted, mapping, usedStable, looseGapMs);
    }

    // ---------------------------------------------------------------
    // Remainder — allocate new stable ids for anything still unmatched.
    // ---------------------------------------------------------------
    for (const raw of rawsSorted) {
      if (mapping.has(raw.rawSpeaker)) continue;
      const stableId = allocateStableId();
      mapping.set(raw.rawSpeaker, stableId);
      usedStable.add(stableId);
      known.push({
        stableId,
        firstSeenMs: raw.firstStartMs,
        lastEndMs: raw.lastEndMs,
        totalMs: raw.totalMs,
      });
    }

    return { mapping };
  };

  const reset = () => {
    known = [];
    nextId = 1;
  };

  return { ingest, reset };
}

/**
 * Stable speaker id → deterministic integer index. Used to pick a
 * palette colour. Indexes stay 0-based so SPEAKER_COLORS[0] is the
 * first stable speaker.
 */
export function stableSpeakerIndex(stableId: string): number {
  const m = /^S(\d+)$/.exec(stableId);
  if (m) return Math.max(0, parseInt(m[1], 10) - 1);
  // Fall back to djb2 for unknown formats — better than collapsing to 0.
  let h = 0;
  for (let i = 0; i < stableId.length; i++) {
    h = (h * 31 + stableId.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Default display label for a stable id: "S1" → "Speaker 1". */
export function defaultStableSpeakerLabel(stableId: string): string {
  const m = /^S(\d+)$/.exec(stableId);
  if (m) return `Speaker ${m[1]}`;
  return stableId;
}
