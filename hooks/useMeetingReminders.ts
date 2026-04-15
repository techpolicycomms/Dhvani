"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Meeting } from "@/lib/calendar";
import { useCalendarPrefs } from "./useCalendarPrefs";

const POLL_MS = 5 * 60 * 1000; // refresh /api/calendar/upcoming every 5 min
const TICK_MS = 30 * 1000; // re-evaluate "is it time?" twice a minute

const DISMISSED_KEY = "dhvani-dismissed-reminders";
const NOTIFIED_KEY = "dhvani-notified-reminders";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Cap stored size — meeting ids accumulate over months.
    const trimmed = [...ids].slice(-500);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    /* quota — best effort */
  }
}

export type UseMeetingRemindersReturn = {
  /** The meeting that should currently be surfaced as a reminder, if any. */
  currentReminder: Meeting | null;
  /** Mark this meeting as dismissed (won't return until next sign-in window). */
  dismissReminder: (meetingId: string) => void;
};

/**
 * Watches the user's upcoming calendar and returns the next meeting that's
 * within the user's configured lead window (e.g. "3 min before").
 *
 * Two timers are running:
 *   - poll every 5 min for the upcoming list (cheap; the route is cached)
 *   - tick every 30 s to re-evaluate which meeting (if any) crosses the
 *     reminder threshold without waiting for the next poll
 *
 * Browser notifications are fired once per meeting (de-duped via a ref) when
 * the threshold is first crossed; permission is requested on first use.
 */
export function useMeetingReminders(): UseMeetingRemindersReturn {
  const { prefs } = useCalendarPrefs();
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readSet(DISMISSED_KEY)
  );
  const [now, setNow] = useState(() => Date.now());
  // Persisted across reloads so we don't re-notify the user about the
  // same meeting after a browser restart.
  const notifiedRef = useRef<Set<string>>(readSet(NOTIFIED_KEY));

  // Fetch the upcoming window. We always pull 8 hours so a longer lead-time
  // setting (or a user changing prefs after sign-in) doesn't truncate.
  useEffect(() => {
    if (!prefs.reminders) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/calendar/upcoming?hours=8", {
          credentials: "include",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { meetings?: Meeting[] };
        if (!cancelled && Array.isArray(body.meetings)) {
          setUpcoming(body.meetings);
        }
      } catch {
        /* network — try again on next poll */
      }
    }
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [prefs.reminders]);

  // Re-evaluate the current candidate twice per minute.
  useEffect(() => {
    if (!prefs.reminders) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [prefs.reminders]);

  // Ask for browser-notification permission lazily — only once we actually
  // have something to notify about and the user hasn't opted out.
  useEffect(() => {
    if (!prefs.reminders) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Don't pester immediately on mount; wait until we have an upcoming meeting.
      if (upcoming.length === 0) return;
      void Notification.requestPermission().catch(() => undefined);
    }
  }, [prefs.reminders, upcoming.length]);

  const dismissReminder = useCallback((meetingId: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(meetingId);
      writeSet(DISMISSED_KEY, next);
      return next;
    });
    // A dismissed meeting should also count as notified — otherwise
    // clearing localStorage would re-fire the OS notification.
    notifiedRef.current.add(meetingId);
    writeSet(NOTIFIED_KEY, notifiedRef.current);
  }, []);

  if (!prefs.reminders) {
    return { currentReminder: null, dismissReminder };
  }

  // Pick the soonest meeting whose start is within `reminderLead` minutes
  // (or already underway), that the user hasn't dismissed yet.
  const leadMs = prefs.reminderLead * 60_000;
  const candidate =
    upcoming
      .filter((m) => !dismissed.has(m.id))
      .map((m) => ({ m, ms: new Date(m.start).getTime() - now }))
      // Cover both "starting soon" (ms <= leadMs) and "in progress" cases.
      // Cap how late we keep nagging at 30 minutes after start.
      .filter((x) => x.ms <= leadMs && x.ms > -30 * 60_000)
      .sort((a, b) => a.ms - b.ms)
      .map((x) => x.m)[0] || null;

  // Fire a one-shot browser notification the first time we surface this meeting.
  if (
    candidate &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    !notifiedRef.current.has(candidate.id)
  ) {
    notifiedRef.current.add(candidate.id);
    writeSet(NOTIFIED_KEY, notifiedRef.current);
    try {
      const minsToStart = Math.max(
        0,
        Math.ceil((new Date(candidate.start).getTime() - now) / 60_000)
      );
      new Notification("Dhvani: meeting reminder", {
        body:
          minsToStart === 0
            ? `${candidate.subject} is starting now.`
            : `${candidate.subject} starts in ${minsToStart} min.`,
        tag: `dhvani-${candidate.id}`,
      });
    } catch {
      /* not all browsers honour the constructor — ignore */
    }
  }

  return { currentReminder: candidate, dismissReminder };
}
