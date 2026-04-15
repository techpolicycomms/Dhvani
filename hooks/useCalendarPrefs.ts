"use client";

import { useCallback, useEffect, useState } from "react";

const PREFS_KEY = "dhvani-calendar-prefs";

/** Minutes of lead time before a meeting at which to show the banner. */
export type ReminderLead = 1 | 2 | 3 | 5;

export type CalendarPrefs = {
  /** Show MeetingList on the home page. */
  showMeetings: boolean;
  /** Allow MeetingBanner reminders to surface. */
  reminders: boolean;
  /** Lead time used by useMeetingReminders. */
  reminderLead: ReminderLead;
  /** Auto-attach meeting metadata to saved transcripts. */
  autoTag: boolean;
};

const DEFAULT_PREFS: CalendarPrefs = {
  showMeetings: true,
  reminders: true,
  reminderLead: 3,
  autoTag: true,
};

function read(): CalendarPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function write(prefs: CalendarPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* quota — best effort */
  }
}

/**
 * Read/write hook for calendar-related preferences. Backed by localStorage
 * under a single key so the four toggles update atomically.
 *
 * We initialize from defaults and rehydrate on mount to keep SSR happy
 * (localStorage isn't available during the server render).
 */
export function useCalendarPrefs(): {
  prefs: CalendarPrefs;
  setPrefs: (patch: Partial<CalendarPrefs>) => void;
  ready: boolean;
} {
  const [prefs, setLocal] = useState<CalendarPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocal(read());
    setReady(true);
  }, []);

  const setPrefs = useCallback((patch: Partial<CalendarPrefs>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      write(next);
      return next;
    });
  }, []);

  return { prefs, setPrefs, ready };
}
