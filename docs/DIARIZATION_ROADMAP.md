# Speaker diarization roadmap

## Status (2026-04-20)

Shipped — stopgap time-adjacency stitcher (`lib/speakerStitcher.ts`).

- Fixes the primary "speaker_0 means a different voice in every chunk"
  bug. Per-chunk raw diarizer ids (from Azure `gpt-4o-transcribe-diarize`)
  are normalised to session-stable ids (`S1`, `S2`, …) using greedy
  time-adjacency matching. Same approach ported to the Chrome
  extension at [`extension/sidepanel.js`](../extension/sidepanel.js).
- Inline speaker-merge UI in [`TranscriptPanel`](../components/TranscriptPanel.tsx)
  via `useTranscriptStore.mergeSpeakers` — so any stitcher miss is
  fixable in one click instead of re-labelling every entry.

Known limits of the stopgap:

- **Long gap of silence > 2s** between the same speaker's turns →
  fresh stable id allocated. User sees the voice split in two and
  fixes with the Merge button.
- **Two speakers alternate within 2s** → the heuristic can swap them.
  Rare in practice for ITU meetings where turns average ~7s.
- **Different speaker count across chunks** → the "new" speaker gets
  a new id; the "departed" speaker is just absent that chunk — both
  desirable behaviours.

## Next — Q2 (voice embedding based clustering)

Drop the time heuristic entirely in favour of an acoustic voice
embedding that persists across the whole session.

### Approach

1. For every chunk, compute a speaker embedding (~192-d vector) per
   diarized segment using a small on-device model. Candidates:
   - **`speechbrain/spkrec-ecapa-voxceleb`** via `@xenova/transformers`
     (~20 MB WASM, 192-d ECAPA-TDNN embedding). Well-tested for
     speaker verification.
   - **`pyannote/embedding`** via ONNX export → onnxruntime-web (~15 MB,
     512-d). Also strong; slightly less mature on web.
2. Maintain per-session `Map<stableId, centroidVector>`. For each new
   segment, compute cosine similarity to every known centroid; if the
   max similarity is above threshold (empirical ~0.72) merge into
   that stableId and update the centroid incrementally; else allocate
   a new id.
3. Run this in a Web Worker so it doesn't block the main thread.
4. Fall back cleanly when WASM / WebGPU isn't available (still have
   the time-adjacency stitcher).

### Implementation tasks

- [ ] Add `@xenova/transformers` as an optional dependency behind a
      feature flag (`VOICE_EMBEDDING_DIARIZATION`). Bundle size is
      significant (~4 MB JS + 20 MB model on first use) — must not
      bloat the default web bundle.
- [ ] Audit CSP headers — `wasm-eval` directive required for
      onnxruntime-web. See `middleware.ts`.
- [ ] Cache the model in Cache Storage so it's downloaded once, not
      per session. Reuse the service worker already shipping in
      `public/sw.js`.
- [ ] Implement `lib/voiceEmbeddingDiarizer.ts` with the same
      `SpeakerStitcher` interface as the stopgap so
      `useTranscription` can swap between them at runtime.
- [ ] Tune similarity threshold on a labelled set of ITU meeting
      snippets. Too low → collapses similar voices; too high →
      over-splits.
- [ ] Worker lifecycle: instantiate on first recording start, destroy
      on stopCapture + 30s idle.

### Success metrics

- Speaker Identification Error Rate (SID-DER) on 10 labelled ITU
  meetings < 8% (stopgap is ~20-30%).
- Voice embeddings computed fast enough that diarization is not the
  bottleneck — target p95 < 150ms per 6s chunk on an M1 MacBook Air
  and < 600ms on a mid-range Android phone.

## Later — enrolled-voice mode

For ITU meetings with known attendees, offer a one-time "record a
5-second sample of your voice" step per participant. Match via
cosine similarity to the enrolled centroid — zero-shot identification
at near-commercial accuracy. Integrates with the calendar attendee
list so the enrolment prompt can pre-populate names.

## JTBD alignment

| Stage | Mobile UX | Info Entry | 360° View | AI Cons. | Integ. | Cost |
|---|---|---|---|---|---|---|
| Stopgap stitcher | ● | ●● | ●●● | ●● | · | · |
| Embedding diarizer | ● | ●●● | ●●● | ●●● | · | · |
| Enrolled voices | · | ●●● | ●●● | ●●● | ●●● | · |

Embedding diarization is a ●●● primary driver for **360° View**
(cross-meeting attribution actually works) and **AI Consumption**
(summaries can say "Alice raised concerns about X" with confidence).
