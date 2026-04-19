"use client";

import { useEffect, useState } from "react";
import { Bell, Mic, X } from "lucide-react";
import {
  PLATFORM_BADGE_CLASS,
  PLATFORM_LABELS,
  type Meeting,
} from "@/lib/calendar";

type Props = {
  meeting: Meeting;
  /** Click → start transcription for this meeting. */
  onStart: () => void;
  /** Click → hide the banner; the parent should remember the dismissed id. */
  onDismiss: () => void;
};

/**
 * Sticky reminder banner for a meeting that's about to start (or in
 * progress). Appears above the page content with a subtle ITU-Blue tint;
 * the countdown re-renders every 30 seconds.
 *
 * Visibility lifecycle is owned by the parent (useMeetingReminders) so this
 * component is a pure presenter.
 */
export function MeetingBanner({ meeting, onStart, onDismiss }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const startMs = new Date(meeting.start).getTime();
  const diffMs = startMs - now;
  const inProgress = diffMs <= 0;
  const minutes = Math.max(0, Math.ceil(diffMs / 60_000));

  const label = inProgress
    ? "Meeting in progress"
    : minutes <= 1
    ? "Starting in less than a minute"
    : `Starting in ${minutes} min`;

  return (
    <div
      className="sticky top-[3px] z-40 w-full bg-[#E8F4FA] border-b border-itu-blue/40"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-6xl px-3 sm:px-6 py-2.5 flex items-center gap-3">
        <Bell size={16} className="text-itu-blue-dark shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-itu-blue-dark uppercase tracking-wide">
              {label}
            </span>
            <span
              className={[
                "text-[11px] font-medium px-1.5 py-0.5 rounded",
                PLATFORM_BADGE_CLASS[meeting.platform],
              ].join(" ")}
            >
              {PLATFORM_LABELS[meeting.platform]}
            </span>
          </div>
          <div className="text-sm text-dark-navy truncate">
            {meeting.subject}
          </div>
        </div>

        <button
          onClick={() => {
            console.log("[MeetingBanner] Start transcription clicked", {
              meetingId: meeting.id,
            });
            onStart();
          }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-itu-blue text-white hover:bg-itu-blue-dark"
        >
          <Mic size={12} aria-hidden="true" />
          Start transcription
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-white/60"
          aria-label="Dismiss reminder"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
