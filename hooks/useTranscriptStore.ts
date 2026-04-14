"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LS_KEYS, type TranscriptEntry } from "@/lib/constants";

// Auto-save interval — every 30 seconds, per spec.
const AUTOSAVE_MS = 30_000;

// Cap each localStorage slot to avoid the 5 MB quota on mobile Safari.
// At ~200 chars/entry, 500 entries ≈ 100 KB; 50 slots = room for 25k entries.
const ENTRIES_PER_SLOT = 500;

export type UseTranscriptStoreReturn = {
  transcript: TranscriptEntry[];
  addEntry: (entry: TranscriptEntry) => void;
  clearTranscript: () => void;
  hasSavedSession: boolean;
  resumeSession: () => void;
  discardSavedSession: () => void;
};

function readSavedSession(): TranscriptEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    // Look for the chunked format first, then fall back to the single-key format.
    const parts: TranscriptEntry[] = [];
    let i = 0;
    while (true) {
      const raw = localStorage.getItem(`${LS_KEYS.sessionChunkPrefix}${i}`);
      if (!raw) break;
      const arr = JSON.parse(raw) as TranscriptEntry[];
      if (!Array.isArray(arr)) break;
      parts.push(...arr);
      i++;
    }
    if (parts.length > 0) return parts;
    const fallback = localStorage.getItem(LS_KEYS.session);
    if (fallback) {
      const arr = JSON.parse(fallback) as TranscriptEntry[];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch {
    /* corrupt storage — ignore */
  }
  return null;
}

function writeSavedSession(entries: TranscriptEntry[]) {
  if (typeof window === "undefined") return;
  try {
    // Clear previous chunked slots so a shrinking transcript doesn't leave stale data.
    for (let i = 0; i < 100; i++) {
      const key = `${LS_KEYS.sessionChunkPrefix}${i}`;
      if (localStorage.getItem(key) === null) break;
      localStorage.removeItem(key);
    }
    localStorage.removeItem(LS_KEYS.session);

    if (entries.length <= ENTRIES_PER_SLOT) {
      localStorage.setItem(LS_KEYS.session, JSON.stringify(entries));
      return;
    }
    for (let i = 0, slot = 0; i < entries.length; i += ENTRIES_PER_SLOT, slot++) {
      const part = entries.slice(i, i + ENTRIES_PER_SLOT);
      localStorage.setItem(
        `${LS_KEYS.sessionChunkPrefix}${slot}`,
        JSON.stringify(part)
      );
    }
  } catch (err) {
    // QuotaExceeded — best-effort, just log.
    console.warn("dhvani: failed to persist transcript", err);
  }
}

function clearSavedSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEYS.session);
  for (let i = 0; i < 100; i++) {
    const key = `${LS_KEYS.sessionChunkPrefix}${i}`;
    if (localStorage.getItem(key) === null) break;
    localStorage.removeItem(key);
  }
}

/**
 * Transcript state + localStorage persistence.
 *
 * On mount, checks for a saved session and exposes hasSavedSession so the
 * UI can prompt the user to resume. Auto-saves the in-memory transcript
 * every 30 seconds (and flushes on unmount).
 */
export function useTranscriptStore(): UseTranscriptStoreReturn {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const savedRef = useRef<TranscriptEntry[] | null>(null);

  // On mount, check for a saved session.
  useEffect(() => {
    const saved = readSavedSession();
    if (saved && saved.length > 0) {
      savedRef.current = saved;
      setHasSavedSession(true);
    }
  }, []);

  // Auto-save loop.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (transcript.length > 0) writeSavedSession(transcript);
    }, AUTOSAVE_MS);
    return () => {
      window.clearInterval(id);
      // Flush on unmount.
      if (transcript.length > 0) writeSavedSession(transcript);
    };
  }, [transcript]);

  const addEntry = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    clearSavedSession();
    setHasSavedSession(false);
    savedRef.current = null;
  }, []);

  const resumeSession = useCallback(() => {
    if (savedRef.current) {
      setTranscript(savedRef.current);
    }
    setHasSavedSession(false);
  }, []);

  const discardSavedSession = useCallback(() => {
    clearSavedSession();
    setHasSavedSession(false);
    savedRef.current = null;
  }, []);

  return {
    transcript,
    addEntry,
    clearTranscript,
    hasSavedSession,
    resumeSession,
    discardSavedSession,
  };
}
