"use client";

/**
 * Global transcription state — provides audio capture, the transcript
 * store, and the transcription pipeline to every page via React
 * context. Because the provider lives in `app/layout.tsx`, it mounts
 * once per browser session and **persists across Next.js App Router
 * navigation** — users can switch to /transcripts or /admin while
 * recording continues.
 *
 * The context intentionally wraps the existing hooks rather than
 * re-implementing them. The hooks (`useAudioCapture`,
 * `useTranscription`, `useTranscriptStore`, `useChunkDispatcher`)
 * carry months of careful debugging — chunk cycling, hydration,
 * speaker priming, rate limiting. Keeping them untouched means zero
 * regression risk from this refactor.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import {
  useChunkDispatcher,
  useTranscription,
} from "@/hooks/useTranscription";
import { useTranscriptStore } from "@/hooks/useTranscriptStore";
import {
  DEFAULT_CHUNK_DURATION_MS,
  LS_KEYS,
  type CaptureMode,
} from "@/lib/constants";

type AudioCaptureValue = ReturnType<typeof useAudioCapture>;
type TranscriptionValue = ReturnType<typeof useTranscription>;
type StoreValue = ReturnType<typeof useTranscriptStore>;

type TranscriptionContextValue = {
  capture: AudioCaptureValue;
  tx: TranscriptionValue;
  store: StoreValue;

  // Persisted UI prefs that influence the hooks above.
  language: string;
  setLanguage: (v: string) => void;
  chunkDuration: number;
  setChunkDuration: (v: number) => void;
  deviceId: string;
  setDeviceId: (v: string) => void;
  chosenMode: string;
  setChosenMode: (v: string) => void;

  // Shared transient state (toast + rate-limit banner).
  toast: string | null;
  setToast: (v: string | null) => void;
  rateLimitMsg: string | null;
  setRateLimitMsg: (v: string | null) => void;

  /**
   * Stop any active recording, abort in-flight transcription, clear
   * the transcript. If `autoSave` is true (default) and the current
   * transcript has entries, it's POSTed to /api/transcripts first so
   * the user's work lands in history instead of being lost.
   */
  clearSession: (opts?: { autoSave?: boolean }) => Promise<void>;
};

const Context = createContext<TranscriptionContextValue | null>(null);

export function useTranscriptionContext(): TranscriptionContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error(
      "useTranscriptionContext must be used inside <TranscriptionProvider>"
    );
  }
  return ctx;
}

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  // --- persisted prefs (localStorage) ---
  const [language, setLanguage] = usePersistedString(LS_KEYS.language, "");
  const [chunkDuration, setChunkDuration] = usePersistedNumber(
    LS_KEYS.chunkDuration,
    DEFAULT_CHUNK_DURATION_MS
  );
  const [deviceId, setDeviceId] = usePersistedString(LS_KEYS.deviceId, "");
  const [chosenMode, setChosenMode] = usePersistedString(
    LS_KEYS.captureMode,
    ""
  );

  // --- shared transient UI state ---
  const [toast, setToast] = useState<string | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  // --- transcript store (auto-saves to localStorage, holds speaker map) ---
  const store = useTranscriptStore();

  // --- audio capture (MediaRecorder, waveform stream, mode) ---
  const capture = useAudioCapture({
    chunkDuration,
    preferredDeviceId: deviceId || undefined,
  });

  // --- transcription pipeline (API calls + queue + retries) ---
  const tx = useTranscription({
    language,
    onEntry: store.addEntry,
    onError: (msg, idx) => {
      setToast(`Chunk ${idx + 1} failed: ${msg}`);
      setTimeout(() => setToast(null), 4000);
    },
    onRateLimited: (msg) => {
      setRateLimitMsg(msg);
      tx.abort();
      capture.stopCapture();
    },
  });

  // --- dispatch new capture chunks through the pipeline ---
  useChunkDispatcher(capture.audioChunks, tx.transcribeChunk);

  // --- clearSession: auto-save, stop recording, wipe transcript ---
  const clearSession = useCallback<
    TranscriptionContextValue["clearSession"]
  >(
    async ({ autoSave = true } = {}) => {
      if (autoSave && store.transcript.length > 0) {
        try {
          const startedAt =
            store.transcript[0]?.timestamp || new Date().toISOString();
          const endedAt = new Date().toISOString();
          await fetch("/api/transcripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              entries: store.transcript,
              speakerNames: store.speakerNames,
              startedAt,
              endedAt,
              durationMinutes: tx.totalMinutes,
              chunkCount: capture.chunkCount,
              estimatedCost: tx.estimatedCost,
              title: store.activeMeeting?.subject,
              meeting: store.activeMeeting
                ? {
                    id: store.activeMeeting.id,
                    subject: store.activeMeeting.subject,
                    platform: store.activeMeeting.platform,
                    start: store.activeMeeting.start,
                    end: store.activeMeeting.end,
                    organizer: store.activeMeeting.organizer,
                  }
                : undefined,
            }),
          });
        } catch (err) {
          console.warn("[clearSession] auto-save failed", err);
        }
      }
      tx.abort();
      capture.stopCapture();
      store.clearTranscript();
      store.setActiveMeeting(null);
    },
    [store, tx, capture]
  );

  return (
    <Context.Provider
      value={{
        capture,
        tx,
        store,
        language,
        setLanguage,
        chunkDuration,
        setChunkDuration,
        deviceId,
        setDeviceId,
        chosenMode,
        setChosenMode,
        toast,
        setToast,
        rateLimitMsg,
        setRateLimitMsg,
        clearSession,
      }}
    >
      {children}
    </Context.Provider>
  );
}

// ---------------------------------------------------------------------
// Small localStorage-backed state helpers — duplicated from app/page.tsx
// so the provider has no upward import dependency.
// ---------------------------------------------------------------------

function usePersistedString(
  key: string,
  initial: string
): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored);
  }, [key]);
  const update = useCallback(
    (v: string) => {
      setValue(v);
      if (typeof window !== "undefined") localStorage.setItem(key, v);
    },
    [key]
  );
  return [value, update];
}

function usePersistedNumber(
  key: string,
  initial: number
): [number, (v: number) => void] {
  const [value, setValue] = useState<number>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n)) setValue(n);
    }
  }, [key]);
  const update = useCallback(
    (v: number) => {
      setValue(v);
      if (typeof window !== "undefined") localStorage.setItem(key, String(v));
    },
    [key]
  );
  return [value, update];
}

// Re-export types the home page consumes.
export type { CaptureMode };
