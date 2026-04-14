"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptEntry } from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  isCapturing: boolean;
};

/**
 * Scrolling transcript panel. Supports:
 *   - Keyword search with highlighting.
 *   - Auto-scroll to latest entry, with a scroll-lock that pauses auto-scroll
 *     once the user scrolls up manually. Jumping to the bottom re-enables it.
 */
export function TranscriptPanel({ transcript, isCapturing }: Props) {
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transcript;
    return transcript.filter((e) => e.text.toLowerCase().includes(q));
  }, [transcript, search]);

  // Auto-scroll to bottom whenever a new entry arrives.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, autoScroll]);

  // Detect user-initiated scroll-up to pause auto-scroll.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance > 40 && autoScroll) setAutoScroll(false);
    if (distance < 4 && !autoScroll) setAutoScroll(true);
  };

  const highlight = (text: string) => {
    const q = search.trim();
    if (!q) return text;
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((p, i) =>
      regex.test(p) ? (
        <mark key={i} className="dhvani-highlight">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  };

  return (
    <div className="flex flex-col h-full bg-navy-light/40 rounded-lg border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-navy-light/70">
        <input
          type="search"
          placeholder="Search transcript…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-navy rounded px-3 py-1.5 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-teal"
        />
        {!autoScroll && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="text-xs px-2 py-1 bg-teal text-navy rounded hover:bg-teal-dark"
          >
            Jump to latest
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="transcript-scroll flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm leading-relaxed"
      >
        {filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/40 text-center py-12">
            {transcript.length === 0
              ? isCapturing
                ? "Listening… transcript will appear here."
                : "Press Start to begin transcribing your meeting."
              : "No entries match your search."}
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="flex gap-3">
              <span className="text-teal/80 font-mono text-xs shrink-0 pt-0.5 tabular-nums">
                [{entry.timestamp}]
              </span>
              <span className="text-white/90 break-words">{highlight(entry.text)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
