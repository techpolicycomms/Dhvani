"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, Users, Video } from "lucide-react";
import {
  isOngoing,
  minutesUntilStart,
  PLATFORM_BADGE_CLASS,
  PLATFORM_LABELS,
  type Meeting,
} from "@/lib/calendar";

type Props = {
  /** Called when the user clicks "Transcribe" / "Transcribe Now" on a card. */
  onStartTranscription: (meeting: Meeting) => void;
};

/**
 * Today's online meetings, fetched from /api/calendar/today.
 *
 * Refreshes every 5 minutes so the "NOW" highlight follows the clock.
 * Renders a subtle skeleton while loading and a friendly empty state when
 * there's nothing on the calendar.
 */
export function MeetingList({ onStartTranscription }: Props) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tz =
          (typeof Intl !== "undefined" &&
            Intl.DateTimeFormat().resolvedOptions().timeZone) ||
          "UTC";
        const res = await fetch(
          `/api/calendar/today?tz=${encodeURIComponent(tz)}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { meetings?: Meeting[] };
        if (!cancelled) {
          setMeetings(Array.isArray(body.meetings) ? body.meetings : []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Failed to load meetings.");
          setMeetings([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    // Re-poll every 5 minutes — the today route caches for 5 min anyway.
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Force a re-render every minute so countdown labels and "NOW" pills
  // stay accurate without a fresh network round-trip.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 rounded-lg bg-light-gray animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border-gray bg-white p-4 text-sm text-mid-gray">
        Couldn&apos;t load your calendar. {error}
      </div>
    );
  }

  if (!meetings || meetings.length === 0) {
    return (
      <div className="rounded-lg border border-border-gray bg-white p-6 flex flex-col items-center text-center text-mid-gray">
        <Calendar size={28} className="mb-2 text-itu-blue/60" />
        <div className="text-sm font-medium text-dark-navy">
          No meetings today
        </div>
        <div className="text-xs mt-1">
          Online meetings on your Outlook calendar will appear here.
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {meetings.map((m) => (
        <MeetingCard
          key={m.id}
          meeting={m}
          onStart={() => onStartTranscription(m)}
        />
      ))}
    </ul>
  );
}

function MeetingCard({
  meeting,
  onStart,
}: {
  meeting: Meeting;
  onStart: () => void;
}) {
  const ongoing = isOngoing(meeting);
  const minsUntil = minutesUntilStart(meeting);
  const startingSoon = !ongoing && minsUntil >= 0 && minsUntil <= 5;

  return (
    <li
      className={[
        "rounded-lg border border-border-gray bg-white p-3 sm:p-4",
        "transition-colors",
        ongoing ? "border-l-[3px] border-l-itu-blue bg-[#F0F7FC]" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-dark-navy truncate">
              {meeting.subject}
            </h4>
            <span
              className={[
                "text-[11px] font-medium px-1.5 py-0.5 rounded",
                PLATFORM_BADGE_CLASS[meeting.platform],
              ].join(" ")}
            >
              {PLATFORM_LABELS[meeting.platform]}
            </span>
            {ongoing && (
              <span className="text-[11px] font-semibold text-itu-blue uppercase tracking-wide">
                Now
              </span>
            )}
            {startingSoon && (
              <span className="text-[11px] font-semibold text-warning">
                in {minsUntil}m
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mid-gray">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {formatTimeRange(meeting.start, meeting.end)}
            </span>
            {meeting.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users size={12} />
                {meeting.attendees.length}{" "}
                {meeting.attendees.length === 1 ? "attendee" : "attendees"}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            console.log("[MeetingList] per-meeting Start clicked", {
              meetingId: meeting.id,
            });
            onStart();
          }}
          className={[
            "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold",
            "transition-colors",
            ongoing
              ? "bg-itu-blue text-white hover:bg-itu-blue-dark"
              : "bg-white border border-itu-blue text-itu-blue hover:bg-itu-blue-pale",
          ].join(" ")}
        >
          <Video size={12} />
          {ongoing ? "Transcribe Now" : "Transcribe"}
        </button>
      </div>
    </li>
  );
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
