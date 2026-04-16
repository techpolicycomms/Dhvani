"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  MAX_CONCURRENT_TRANSCRIPTIONS,
  MIN_TRANSCRIPT_LENGTH,
  WHISPER_PRICE_PER_MINUTE,
  defaultSpeakerLabel,
  type TranscriptEntry,
} from "@/lib/constants";
import { blobToFile, formatElapsed } from "@/lib/audioUtils";
import type { CapturedChunk } from "./useAudioCapture";

export type UseTranscriptionOptions = {
  language?: string; // ISO code or "" for auto
  onEntry?: (entry: TranscriptEntry) => void;
  onError?: (msg: string, chunkIndex: number) => void;
  onRateLimited?: (msg: string, retryAfterSeconds?: number) => void;
};

export type UseTranscriptionReturn = {
  transcribeChunk: (chunk: CapturedChunk) => void;
  abort: () => void;
  queueDepth: number;
  inFlight: number;
  totalMinutes: number;
  estimatedCost: number;
  failedChunks: number;
};

// Simple sleep helper for exponential backoff retries.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RawSegment = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};

type GroupedTurn = {
  rawSpeaker: string;
  text: string;
  startMs: number;
  endMs: number;
};

/**
 * Collapse consecutive same-speaker segments into a single turn. The
 * diarizer returns one segment per utterance; without grouping we'd get
 * a blizzard of one-liners when someone talks for 10 seconds.
 */
function groupBySpeaker(segments: RawSegment[]): GroupedTurn[] {
  const out: GroupedTurn[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.rawSpeaker === s.speaker) {
      last.text = (last.text + " " + s.text).trim();
      last.endMs = s.end * 1000;
    } else {
      out.push({
        rawSpeaker: s.speaker,
        text: s.text.trim(),
        startMs: s.start * 1000,
        endMs: s.end * 1000,
      });
    }
  }
  return out;
}

/**
 * Transcription pipeline hook.
 *
 * Feeds audio chunks through /api/transcribe while enforcing:
 *   - a max of MAX_CONCURRENT_TRANSCRIPTIONS in-flight requests
 *   - FIFO queueing of any overflow
 *   - exponential-backoff retries (1s, 2s, 4s) on network errors and 429s
 *   - silence-filtering (drop results shorter than MIN_TRANSCRIPT_LENGTH)
 *   - running cumulative audio-minute and cost accounting
 *
 * The caller is responsible for appending returned entries to their
 * transcript store (via the onEntry callback).
 */
export function useTranscription(
  options: UseTranscriptionOptions = {}
): UseTranscriptionReturn {
  const { language, onEntry, onError, onRateLimited } = options;

  const [queueDepth, setQueueDepth] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);

  // We model the queue as a ref to avoid re-render thrash on every push.
  const queueRef = useRef<CapturedChunk[]>([]);
  const inFlightRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const syncState = useCallback(() => {
    setQueueDepth(queueRef.current.length);
    setInFlight(inFlightRef.current);
  }, []);

  const sendOne = useCallback(
    async (chunk: CapturedChunk): Promise<void> => {
      const file = blobToFile(chunk.blob, chunk.extension, chunk.index);
      const form = new FormData();
      form.append("file", file);

      const headers: Record<string, string> = {
        "x-audio-seconds": String(chunk.durationMs / 1000),
        "x-chunk-id": String(chunk.index),
      };
      if (language) headers["x-language"] = language;

      const maxAttempts = 3;
      let attempt = 0;
      let lastErr: Error | null = null;
      while (attempt < maxAttempts) {
        attempt++;
        try {
          if (abortRef.current?.signal.aborted) return;
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
            headers,
            signal: abortRef.current?.signal,
          });
          if (res.status === 429) {
            // Rate-limited by our server. Surface to UI and stop — further
            // retries would just repeat the denial.
            const body = await res.json().catch(() => ({}));
            onRateLimited?.(
              body.error || "Rate limit reached.",
              body.retryAfterSeconds
            );
            return;
          }
          if (res.status === 401) {
            // Session expired — stop silently; the middleware will redirect
            // the next navigation back to signin.
            onError?.("Session expired. Please sign in again.", chunk.index);
            return;
          }
          if (res.status >= 500) {
            const body = await res.json().catch(() => ({}));
            lastErr = new Error(body.error || `HTTP ${res.status}`);
            if (attempt < maxAttempts) {
              await sleep(1000 * Math.pow(2, attempt - 1));
              continue;
            }
            throw lastErr;
          }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            // Non-fatal: malformed browser chunk. Skip quietly.
            if (
              res.status === 400 &&
              typeof body.error === "string" &&
              /audio file might be corrupted|unsupported|invalid file format/i.test(
                body.error
              )
            ) {
              return;
            }
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as {
            text?: string;
            segments?: Array<{
              speaker: string;
              text: string;
              start: number;
              end: number;
            }>;
          };
          const segments = Array.isArray(data.segments) ? data.segments : [];
          if (segments.length > 0) {
            // Group consecutive same-speaker segments into one entry so
            // a single speaker's continuous turn reads naturally. Keep
            // the start offset of the first segment in the group for the
            // displayed timestamp.
            const grouped = groupBySpeaker(segments);
            for (const g of grouped) {
              const text = g.text.trim();
              if (text.length < MIN_TRANSCRIPT_LENGTH) continue;
              onEntry?.({
                id: uuid(),
                timestamp: formatElapsed(chunk.capturedAtMs + g.startMs),
                text,
                rawSpeaker: g.rawSpeaker,
                speaker: defaultSpeakerLabel(g.rawSpeaker),
              });
            }
          } else {
            // Fallback: model didn't return segments (e.g. deployment
            // pointing at a non-diarizing model). Emit one unsegmented
            // entry with no speaker label.
            const text = (data.text || "").trim();
            if (text.length >= MIN_TRANSCRIPT_LENGTH) {
              onEntry?.({
                id: uuid(),
                timestamp: formatElapsed(chunk.capturedAtMs),
                text,
              });
            }
          }
          // Update cost accounting.
          const minutes = chunk.durationMs / 60000;
          setTotalMinutes((t) => t + minutes);
          return;
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          lastErr = err as Error;
          if (attempt < maxAttempts) {
            await sleep(1000 * Math.pow(2, attempt - 1));
            continue;
          }
        }
      }
      // All retries exhausted — log, bump counter, move on.
      setFailedChunks((n) => n + 1);
      onError?.(lastErr?.message || "Transcription failed.", chunk.index);
    },
    [language, onEntry, onError, onRateLimited]
  );

  const drain = useCallback(async () => {
    while (
      inFlightRef.current < MAX_CONCURRENT_TRANSCRIPTIONS &&
      queueRef.current.length > 0
    ) {
      const chunk = queueRef.current.shift()!;
      inFlightRef.current++;
      syncState();
      // Fire and forget — sendOne manages its own lifecycle.
      sendOne(chunk).finally(() => {
        inFlightRef.current--;
        syncState();
        // After a slot opens, try to drain more work.
        void drain();
      });
    }
  }, [sendOne, syncState]);

  const transcribeChunk = useCallback(
    (chunk: CapturedChunk) => {
      if (!abortRef.current || abortRef.current.signal.aborted) {
        abortRef.current = new AbortController();
      }
      queueRef.current.push(chunk);
      syncState();
      void drain();
    },
    [drain, syncState]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    queueRef.current = [];
    syncState();
  }, [syncState]);

  const estimatedCost = totalMinutes * WHISPER_PRICE_PER_MINUTE;

  return {
    transcribeChunk,
    abort,
    queueDepth,
    inFlight,
    totalMinutes,
    estimatedCost,
    failedChunks,
  };
}

/**
 * Drive useTranscription off of a growing audioChunks array. Only the
 * newly appended chunks (since the last render) are enqueued.
 */
export function useChunkDispatcher(
  chunks: CapturedChunk[],
  transcribeChunk: (chunk: CapturedChunk) => void
) {
  const dispatchedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const chunk of chunks) {
      if (!dispatchedRef.current.has(chunk.index)) {
        dispatchedRef.current.add(chunk.index);
        transcribeChunk(chunk);
      }
    }
  }, [chunks, transcribeChunk]);
}
