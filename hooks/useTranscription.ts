"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  MAX_CONCURRENT_TRANSCRIPTIONS,
  MIN_TRANSCRIPT_LENGTH,
  WHISPER_PRICE_PER_MINUTE,
  type TranscriptEntry,
} from "@/lib/constants";
import { blobToFile, formatElapsed } from "@/lib/audioUtils";
import type { CapturedChunk } from "./useAudioCapture";

export type UseTranscriptionOptions = {
  apiKey?: string | null;
  language?: string; // ISO code or "" for auto
  onEntry?: (entry: TranscriptEntry) => void;
  onError?: (msg: string, chunkIndex: number) => void;
};

export type UseTranscriptionReturn = {
  transcribeChunk: (chunk: CapturedChunk) => void;
  queueDepth: number;
  inFlight: number;
  totalMinutes: number;
  estimatedCost: number;
  failedChunks: number;
};

// Simple sleep helper for exponential backoff retries.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const { apiKey, language, onEntry, onError } = options;

  const [queueDepth, setQueueDepth] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);

  // We model the queue as a ref to avoid re-render thrash on every push.
  const queueRef = useRef<CapturedChunk[]>([]);
  const inFlightRef = useRef(0);

  const syncState = useCallback(() => {
    setQueueDepth(queueRef.current.length);
    setInFlight(inFlightRef.current);
  }, []);

  const sendOne = useCallback(
    async (chunk: CapturedChunk): Promise<void> => {
      const file = blobToFile(chunk.blob, chunk.extension, chunk.index);
      const form = new FormData();
      form.append("file", file);

      const headers: Record<string, string> = {};
      if (apiKey) headers["x-openai-key"] = apiKey;
      if (language) headers["x-language"] = language;

      const maxAttempts = 3;
      let attempt = 0;
      let lastErr: Error | null = null;
      while (attempt < maxAttempts) {
        attempt++;
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
            headers,
          });
          if (res.status === 429 || res.status >= 500) {
            // Retryable.
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
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { text?: string };
          const text = (data.text || "").trim();
          if (text.length >= MIN_TRANSCRIPT_LENGTH) {
            onEntry?.({
              id: uuid(),
              timestamp: formatElapsed(chunk.capturedAtMs),
              text,
            });
          }
          // Update cost accounting.
          const minutes = chunk.durationMs / 60000;
          setTotalMinutes((t) => t + minutes);
          return;
        } catch (err) {
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
    [apiKey, language, onEntry, onError]
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
      queueRef.current.push(chunk);
      syncState();
      void drain();
    },
    [drain, syncState]
  );

  const estimatedCost = totalMinutes * WHISPER_PRICE_PER_MINUTE;

  return {
    transcribeChunk,
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
