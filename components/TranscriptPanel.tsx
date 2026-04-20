"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, MicOff, Search, Star } from "lucide-react";
import {
  QUEUE_BACKPRESSURE_THRESHOLD,
  colorForSpeaker,
  type TranscriptEntry,
} from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  isCapturing: boolean;
  detectedSpeakers?: string[];
  resolveSpeaker?: (rawSpeaker: string | undefined) => string | undefined;
  renameSpeaker?: (rawSpeaker: string, displayName: string) => void;
  /**
   * Names we expect to hear — signed-in user first, then attendees from
   * the calendar invite. Powers the one-click assign picker so users
   * can tag a voice cluster with a real name without typing.
   */
  expectedSpeakers?: string[];
  /** Display label for the signed-in user (e.g. "David (you)"). */
  currentUserLabel?: string | null;
  pinnedIds?: Set<string>;
  onTogglePin?: (entryId: string) => void;
  /**
   * Correct a single entry's text (double-click the entry to edit).
   * Empty string cancels — the callback handles its own no-op for
   * whitespace-only input.
   */
  onEditEntry?: (entryId: string, newText: string) => void;
  /** True when a chunk is being transcribed — shows the listening dots. */
  isProcessing?: boolean;
  /**
   * Combined in-flight + queued chunk count. When it crosses
   * QUEUE_BACKPRESSURE_THRESHOLD we surface a non-blocking hint that
   * transcription is catching up, so users don't read "silence" as a
   * bug.
   */
  backpressure?: number;
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
  expectedSpeakers = [],
  currentUserLabel,
  pinnedIds,
  onTogglePin,
  onEditEntry,
  isProcessing,
  backpressure = 0,
}: Props) {
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const entryRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  // Jump to entry by URL hash (e.g. #t=00:05:30)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#t=")) return;
    const target = hash.slice(3);
    const entry = transcript.find((e) => e.timestamp === target);
    if (entry) {
      const el = entryRefs.current.get(entry.id);
      if (el) {
        setAutoScroll(false);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-itu-blue");
        setTimeout(() => el.classList.remove("ring-2", "ring-itu-blue"), 2000);
      }
    }
  }, [transcript]);

  const jumpToTimestamp = (entryId: string, timestamp: string) => {
    window.history.replaceState(null, "", `#t=${timestamp}`);
    const el = entryRefs.current.get(entryId);
    if (el) {
      setAutoScroll(false);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-itu-blue");
      setTimeout(() => el.classList.remove("ring-2", "ring-itu-blue"), 2000);
    }
  };

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
  const pinnedEntries = pinnedIds && pinnedIds.size > 0
    ? transcript.filter((e) => pinnedIds.has(e.id))
    : [];

  return (
    <div className="flex flex-col sm:flex-row h-full gap-3">
      <div className="flex flex-col flex-1 bg-white rounded-lg border border-border-gray overflow-hidden shadow-sm">
        {pinnedEntries.length > 0 && (
          <div className="px-3 py-2 border-b border-border-gray bg-amber-50/50">
            <div className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold mb-1.5 flex items-center gap-1">
              <Star size={10} className="fill-amber-500 text-amber-500" /> Key Moments
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {pinnedEntries.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => jumpToTimestamp(e.id, e.timestamp)}
                  className="block w-full text-left text-xs text-dark-navy hover:text-itu-blue truncate"
                >
                  <span className="font-mono text-itu-blue-dark">[{e.timestamp}]</span>{" "}
                  {e.text.slice(0, 80)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-gray bg-off-white">
          <div className="flex-1 relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mid-gray"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search transcript…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-border-gray rounded pl-8 pr-3 py-1.5 text-sm text-dark-navy placeholder-mid-gray focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
            />
          </div>
          {!autoScroll && (
            <button
              type="button"
              onClick={() => {
                setAutoScroll(true);
                const el = scrollRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-itu-blue text-white rounded hover:bg-itu-blue-dark"
            >
              <ArrowDown size={12} /> Latest
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="transcript-scroll flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed"
        >
          {filtered.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-mid-gray text-center py-12 gap-2">
              {transcript.length === 0 && isCapturing ? (
                <>
                  <span>Listening…</span>
                  <span
                    className="dhvani-listening-dots"
                    aria-label="Transcribing audio"
                  >
                    <span />
                    <span />
                    <span />
                  </span>
                </>
              ) : transcript.length === 0 ? (
                <>
                  <MicOff
                    size={28}
                    className="text-itu-blue/50"
                    aria-hidden="true"
                  />
                  <span>Press Start to begin transcribing your meeting.</span>
                </>
              ) : (
                <>
                  <Search
                    size={24}
                    className="text-itu-blue/40"
                    aria-hidden="true"
                  />
                  <span>No entries match your search.</span>
                </>
              )}
            </div>
          ) : (
            filtered.map((entry, idx) => {
              const raw = entry.rawSpeaker;
              const display = resolveSpeaker?.(raw) ?? entry.speaker;
              const color = raw ? colorForSpeaker(raw) : undefined;
              const zebra = idx % 2 === 1 ? "bg-off-white" : "bg-white";
              return (
                <div
                  key={entry.id}
                  ref={(el) => { if (el) entryRefs.current.set(entry.id, el); }}
                  className={`group flex gap-3 px-2 py-1.5 rounded ${zebra} transcript-entry transition-shadow ${pinnedIds?.has(entry.id) ? "bg-amber-50/50 border-l-2 border-amber-400" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => jumpToTimestamp(entry.id, entry.timestamp)}
                    className="text-itu-blue-dark font-mono text-xs shrink-0 pt-0.5 tabular-nums hover:underline cursor-pointer"
                    title="Copy link to this timestamp"
                  >
                    [{entry.timestamp}]
                  </button>
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
                    {onEditEntry && editingEntryId === entry.id ? (
                      <textarea
                        autoFocus
                        value={editingDraft}
                        onChange={(e) => setEditingDraft(e.target.value)}
                        onBlur={() => {
                          if (editingDraft.trim() && editingDraft !== entry.text) {
                            onEditEntry(entry.id, editingDraft);
                          }
                          setEditingEntryId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingEntryId(null);
                          } else if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (editingDraft.trim() && editingDraft !== entry.text) {
                              onEditEntry(entry.id, editingDraft);
                            }
                            setEditingEntryId(null);
                          }
                        }}
                        className="w-full text-dark-gray break-words bg-white border border-itu-blue rounded px-1.5 py-0.5 resize-y min-h-[1.5rem] focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
                        rows={Math.max(1, Math.ceil(editingDraft.length / 70))}
                      />
                    ) : (
                      <span
                        className={`text-dark-gray break-words ${
                          onEditEntry ? "cursor-text hover:bg-off-white/60 rounded px-0.5 -mx-0.5" : ""
                        }`}
                        title={onEditEntry ? "Double-click to fix a typo" : undefined}
                        onDoubleClick={() => {
                          if (!onEditEntry) return;
                          setEditingEntryId(entry.id);
                          setEditingDraft(entry.text);
                        }}
                      >
                        {highlight(entry.text)}
                      </span>
                    )}
                  </div>
                  {onTogglePin && (
                    <button
                      type="button"
                      onClick={() => onTogglePin(entry.id)}
                      className={`shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                        pinnedIds?.has(entry.id)
                          ? "text-amber-500"
                          : "text-mid-gray/40 hover:text-amber-500"
                      }`}
                      title={pinnedIds?.has(entry.id) ? "Unpin moment" : "Pin as key moment"}
                    >
                      <Star size={12} className={pinnedIds?.has(entry.id) ? "fill-amber-500" : ""} />
                    </button>
                  )}
                </div>
              );
            })
          )}
          {/* Pulsing dots below the last entry while a chunk is in flight. */}
          {isProcessing && filtered.length > 0 && (
            <div className="flex items-center gap-2 pl-14 pt-1 text-[11px] text-mid-gray">
              <span
                className="dhvani-listening-dots"
                aria-label="Transcribing next chunk"
              >
                <span />
                <span />
                <span />
              </span>
              {backpressure >= QUEUE_BACKPRESSURE_THRESHOLD && (
                <span className="text-warning">
                  Transcription is {backpressure} chunks behind — catching up
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {(hasSpeakers || expectedSpeakers.length > 0) && (
        <aside className="sm:w-64 shrink-0 bg-white rounded-lg border border-border-gray p-3 text-sm shadow-sm">
          <div className="text-[10px] uppercase tracking-wider text-mid-gray mb-2">
            Speakers
          </div>
          {hasSpeakers && (
            <ul className="space-y-1.5">
              {detectedSpeakers.map((raw) => {
                const color = colorForSpeaker(raw);
                const display = resolveSpeaker?.(raw) ?? raw;
                // A voice cluster is "already named" when the user has
                // explicitly renamed it, i.e. its display differs from the
                // default "Speaker N" label. Drives the Change vs Assign
                // verb on the picker trigger.
                const named = display && !/^Speaker\s/i.test(display);
                return (
                  <li key={raw} className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className="truncate text-dark-navy flex-1 min-w-0"
                        title={display}
                      >
                        {display}
                      </span>
                      {renameSpeaker && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing((prev) => (prev === raw ? null : raw))
                          }
                          className="text-[10px] text-itu-blue-dark hover:text-itu-blue underline underline-offset-2"
                        >
                          {named ? "Change" : "Name"}
                        </button>
                      )}
                    </div>
                    {editing === raw && renameSpeaker && (
                      <SpeakerAssignPicker
                        expectedSpeakers={expectedSpeakers}
                        currentDisplay={display}
                        onPick={(v) => {
                          renameSpeaker(raw, v);
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!hasSpeakers && expectedSpeakers.length > 0 && (
            <div className="text-[11px] text-mid-gray leading-snug">
              Dhvani hasn&apos;t heard anyone yet. When voices appear,
              you&apos;ll be able to tag each one with a name from the
              invite.
            </div>
          )}
          {expectedSpeakers.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-gray">
              <div className="text-[10px] uppercase tracking-wider text-mid-gray mb-1.5">
                From this meeting
              </div>
              <ul className="space-y-0.5 text-[11px] text-dark-gray">
                {expectedSpeakers.map((name, i) => (
                  <li key={`${name}-${i}`} className="truncate" title={name}>
                    {currentUserLabel && i === 0 ? currentUserLabel : name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

/**
 * Speaker assignment picker — replaces the old free-text InlineRename.
 *
 * Renders the expected-speakers list (signed-in user + calendar
 * attendees) as one-click buttons, so the common case — "Speaker 2 is
 * Alice from the Outlook invite" — takes one click instead of typing.
 * Falls back to a custom-name input for speakers not on the invite
 * (guests, unknown voices, renames after the fact).
 *
 * Why this UX, not a combobox: at ITU a meeting often has ~5 attendees.
 * A flat button list is scannable; a combobox is a text-entry toll.
 */
function SpeakerAssignPicker({
  expectedSpeakers,
  currentDisplay,
  onPick,
  onCancel,
}: {
  expectedSpeakers: string[];
  currentDisplay: string;
  onPick: (name: string) => void;
  onCancel: () => void;
}) {
  const [customMode, setCustomMode] = useState(expectedSpeakers.length === 0);
  const [value, setValue] = useState(
    // Only seed with the current display if it's already a human name,
    // not the default "Speaker N" — otherwise custom entry starts empty.
    /^Speaker\s/i.test(currentDisplay) ? "" : currentDisplay
  );

  if (customMode) {
    return (
      <div className="rounded-md border border-itu-blue bg-itu-blue-pale p-2 space-y-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onPick(value.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Type a name"
          className="w-full bg-white border border-border-gray rounded px-2 py-1 text-xs text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
        />
        <div className="flex items-center gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => value.trim() && onPick(value.trim())}
            disabled={!value.trim()}
            className="px-2 py-1 rounded bg-itu-blue text-white font-semibold disabled:opacity-40"
          >
            Save
          </button>
          {expectedSpeakers.length > 0 && (
            <button
              type="button"
              onClick={() => setCustomMode(false)}
              className="px-2 py-1 rounded text-itu-blue-dark hover:bg-white"
            >
              Pick from invite
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 rounded text-mid-gray hover:bg-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-itu-blue bg-itu-blue-pale p-2 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-itu-blue-dark mb-1">
        Who is this?
      </div>
      <ul className="space-y-0.5">
        {expectedSpeakers.map((name, i) => (
          <li key={`${name}-${i}`}>
            <button
              type="button"
              onClick={() => onPick(name)}
              className="w-full text-left truncate text-xs text-dark-navy hover:bg-white rounded px-2 py-1"
              title={name}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1 pt-1 text-[10px]">
        <button
          type="button"
          onClick={() => setCustomMode(true)}
          className="flex-1 text-itu-blue-dark hover:bg-white rounded px-2 py-1 text-left"
        >
          Someone else…
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-mid-gray hover:bg-white rounded px-2 py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
