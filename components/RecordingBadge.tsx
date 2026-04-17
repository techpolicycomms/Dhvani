"use client";

import Link from "next/link";
import { Square } from "lucide-react";
import { useTranscriptionContext } from "@/contexts/TranscriptionContext";
import { formatElapsed } from "@/lib/audioUtils";

/**
 * Fixed-position "recording in progress" pill. Only renders while
 * capture is active. Lives in the root layout so it's visible on
 * every page — the user can leave the home page, navigate to
 * /transcripts or /admin, and still see that recording is active
 * plus a stop button within reach.
 */
export function RecordingBadge() {
  const {
    capture: { isCapturing, elapsedTime, stopCapture },
  } = useTranscriptionContext();

  if (!isCapturing) return null;

  return (
    <div
      className="fixed top-3 right-3 z-40 inline-flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg bg-white border border-error/40"
      role="status"
      aria-live="polite"
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-error opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
      </span>
      <Link
        href="/"
        className="text-xs font-medium text-dark-navy hover:underline tabular-nums"
        title="Back to transcription"
      >
        Recording · {formatElapsed(elapsedTime)}
      </Link>
      <button
        type="button"
        onClick={stopCapture}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-error text-white hover:bg-[#B91C1C]"
        title="Stop recording"
      >
        <Square size={10} fill="currentColor" /> Stop
      </button>
    </div>
  );
}
