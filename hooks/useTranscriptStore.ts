"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LS_KEYS,
  defaultSpeakerLabel,
  type TranscriptEntry,
} from "@/lib/constants";
import type { Meeting } from "@/lib/calendar";

// Auto-save interval — every 30 seconds, per spec.
const AUTOSAVE_MS = 30_000;

// Cap each localStorage slot to avoid the 5 MB quota on mobile Safari.
// At ~200 chars/entry, 500 entries ≈ 100 KB; 50 slots = room for 25k entries.
const ENTRIES_PER_SLOT = 500;

const SPEAKER_NAMES_KEY = "dhvani-speaker-names";

export type UseTranscriptStoreReturn = {
  transcript: TranscriptEntry[];
  addEntry: (entry: TranscriptEntry) => void;
  /**
   * Overwrite the `text` field of a single entry. Used by the inline
   * typo-fix UI in TranscriptPanel — lets the user correct transcription
   * mistakes without re-recording. Triggers the same autosave path as
   * addEntry.
   */
  updateEntryText: (entryId: string, newText: string) => void;
  clearTranscript: () => void;
  hasSavedSession: boolean;
  resumeSession: () => void;
  discardSavedSession: () => void;
  /** Ordered list of raw speaker ids seen in the current transcript. */
  detectedSpeakers: string[];
  /** Map of raw id → current display name (custom rename, if any). */
  speakerNames: Record<string, string>;
  /** Resolve a raw id to its display name (custom or default). */
  resolveSpeaker: (rawSpeaker: string | undefined) => string | undefined;
  /** Rename a speaker. Pass empty string to reset to the default label. */
  renameSpeaker: (rawSpeaker: string, displayName: string) => void;
  /**
   * Seed speaker_0/speaker_1/… with the signed-in user's name followed by
   * meeting attendee names. Only fills slots the user hasn't already
   * customised — so a manual rename is never clobbered on a restart.
   */
  primeSpeakers: (userName: string | null | undefined, attendees?: string[]) => void;
  /** Calendar meeting the current capture is tagged against, if any. */
  activeMeeting: Meeting | null;
  /** Tag the in-progress session with a calendar meeting. */
  setActiveMeeting: (meeting: Meeting | null) => void;
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
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const savedRef = useRef<TranscriptEntry[] | null>(null);

  // On mount, check for a saved session.
  useEffect(() => {
    const saved = readSavedSession();
    if (saved && saved.length > 0) {
      savedRef.current = saved;
      setHasSavedSession(true);
    }
    // Restore any custom speaker names from the previous session.
    try {
      const raw = localStorage.getItem(SPEAKER_NAMES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setSpeakerNames(parsed);
      }
    } catch {
      /* ignore corrupt */
    }
  }, []);

  // Auto-save loop. Depends on speakerNames too so a rename (which never
  // mutates `transcript`) still nudges the autosave window — keeps the
  // serialised state in sync with what the UI is showing.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (transcript.length > 0) writeSavedSession(transcript);
    }, AUTOSAVE_MS);
    return () => {
      window.clearInterval(id);
      // Flush on unmount.
      if (transcript.length > 0) writeSavedSession(transcript);
    };
  }, [transcript, speakerNames]);

  // Persist speaker rename map eagerly — it's tiny.
  useEffect(() => {
    try {
      localStorage.setItem(SPEAKER_NAMES_KEY, JSON.stringify(speakerNames));
    } catch {
      /* quota — best effort */
    }
  }, [speakerNames]);

  const addEntry = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => [...prev, entry]);
  }, []);

  const updateEntryText = useCallback((entryId: string, newText: string) => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    setTranscript((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, text: trimmed } : e))
    );
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    clearSavedSession();
    setHasSavedSession(false);
    savedRef.current = null;
    // Keep the rename map — users commonly re-run against the same
    // speakers and shouldn't lose their labels on "Clear session".
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

  // Preserve first-seen order of raw speaker ids across the transcript
  // so the legend reads top-to-bottom chronologically.
  const detectedSpeakers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of transcript) {
      if (e.rawSpeaker && !seen.has(e.rawSpeaker)) {
        seen.add(e.rawSpeaker);
        out.push(e.rawSpeaker);
      }
    }
    return out;
  }, [transcript]);

  const resolveSpeaker = useCallback(
    (rawSpeaker: string | undefined) => {
      if (!rawSpeaker) return undefined;
      return speakerNames[rawSpeaker] || defaultSpeakerLabel(rawSpeaker);
    },
    [speakerNames]
  );

  const renameSpeaker = useCallback(
    (rawSpeaker: string, displayName: string) => {
      setSpeakerNames((prev) => {
        const next = { ...prev };
        const trimmed = displayName.trim();
        if (!trimmed) delete next[rawSpeaker];
        else next[rawSpeaker] = trimmed;
        return next;
      });
    },
    []
  );

  const primeSpeakers = useCallback(
    (userName: string | null | undefined, attendees: string[] = []) => {
      const candidates: string[] = [];
      if (userName && userName.trim()) candidates.push(userName.trim());
      for (const a of attendees) {
        if (a && typeof a === "string" && a.trim()) candidates.push(a.trim());
      }
      if (candidates.length === 0) return;
      setSpeakerNames((prev) => {
        const next = { ...prev };
        let changed = false;
        candidates.forEach((name, i) => {
          const rawId = `speaker_${i}`;
          // Only seed slots the user hasn't already customised — we must
          // never overwrite a manual rename the user set in a past session.
          if (!next[rawId]) {
            next[rawId] = name;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    []
  );

  return {
    transcript,
    addEntry,
    updateEntryText,
    clearTranscript,
    hasSavedSession,
    resumeSession,
    discardSavedSession,
    detectedSpeakers,
    speakerNames,
    resolveSpeaker,
    renameSpeaker,
    primeSpeakers,
    activeMeeting,
    setActiveMeeting,
  };
}
