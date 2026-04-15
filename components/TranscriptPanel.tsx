"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  colorForSpeaker,
  type TranscriptEntry,
} from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  isCapturing: boolean;
  /** Raw speaker ids in first-seen order — powers the legend. */
  detectedSpeakers?: string[];
  /** Resolve a raw speaker id to its current display name (renamed or default). */
  resolveSpeaker?: (rawSpeaker: string | undefined) => string | undefined;
  /** Persist a rename — empty string resets to default. */
  renameSpeaker?: (rawSpeaker: string, displayName: string) => void;
};

/**
 * Scrolling transcript panel with diarization support.
 *
 *   - Keyword search with highlighting.
 *   - Auto-scroll to latest entry; user scroll-up pauses auto-scroll.
 *   - Each entry shows a colored speaker pill; click to rename.
 *   - Legend on the right lists all detected speakers.
 */
export function TranscriptPanel({
  transcript,
  isCapturing,
  detectedSpeakers = [],
  resolveSpeaker,
  renameSpeaker,
}: Props) {
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // rawSpeaker being renamed
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

  const hasSpeakers = detectedSpeakers.length > 0;

  return (
    <div className="flex flex-col sm:flex-row h-full gap-3">
      <div className="flex flex-col flex-1 bg-navy-light/40 rounded-lg border border-white/5 overflow-hidden">
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
            filtered.map((entry) => {
              const raw = entry.rawSpeaker;
              const display = resolveSpeaker?.(raw) ?? entry.speaker;
              const color = raw ? colorForSpeaker(raw) : undefined;
              return (
                <div key={entry.id} className="flex gap-3">
                  <span className="text-teal/80 font-mono text-xs shrink-0 pt-0.5 tabular-nums">
                    [{entry.timestamp}]
                  </span>
                  <div className="min-w-0 flex-1">
                    {display && raw && (
                      <button
                        type="button"
                        onClick={() => renameSpeaker && setEditing(raw)}
                        className="inline-flex items-center gap-1.5 mr-2 text-xs font-semibold align-baseline hover:underline"
                        style={{ color }}
                        title={renameSpeaker ? "Click to rename" : undefined}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {display}:
                      </button>
                    )}
                    <span className="text-white/90 break-words">
                      {highlight(entry.text)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {hasSpeakers && (
        <aside className="sm:w-56 shrink-0 bg-navy-light/40 rounded-lg border border-white/5 p-3 text-sm">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
            Speakers
          </div>
          <ul className="space-y-1.5">
            {detectedSpeakers.map((raw) => {
              const color = colorForSpeaker(raw);
              const display = resolveSpeaker?.(raw) ?? raw;
              return (
                <li key={raw} className="flex items-center gap-2 min-w-0">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {editing === raw && renameSpeaker ? (
                    <InlineRename
                      initial={display}
                      onSubmit={(v) => {
                        renameSpeaker(raw, v);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => renameSpeaker && setEditing(raw)}
                      className="truncate text-left text-white/90 hover:text-white hover:underline flex-1 min-w-0"
                      title={renameSpeaker ? "Click to rename" : undefined}
                    >
                      {display}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {renameSpeaker && (
            <p className="mt-3 text-[10px] text-white/40 leading-snug">
              Click a speaker to rename. Names persist in this browser.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

function InlineRename({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit(value);
        if (e.key === "Escape") onCancel();
      }}
      className="flex-1 min-w-0 bg-navy border border-teal/40 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-teal"
    />
  );
}
