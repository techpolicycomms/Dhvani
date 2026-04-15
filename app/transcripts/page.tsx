"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Clock,
  Download,
  FileText,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import {
  PLATFORM_BADGE_CLASS,
  PLATFORM_LABELS,
  type MeetingPlatform,
} from "@/lib/calendar";

type DateFilter = "7d" | "30d" | "all";

type ListItem = {
  id: string;
  userId: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  chunkCount: number;
  estimatedCost: number;
  meeting?: {
    id: string;
    subject: string;
    platform: MeetingPlatform;
    start: string;
    end: string;
    organizer?: string;
  };
};

type ListResponse = {
  items: ListItem[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

/**
 * Transcript history page. Lists previously-saved transcripts with a
 * search filter (matches title and meeting subject), date-range filter,
 * and per-item actions (open / export / delete).
 */
export default function TranscriptsPage() {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => setIsAdmin(r.ok))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/transcripts?page=${page}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ListResponse;
        if (!cancelled) {
          setItems(body.items);
          setHasMore(body.hasMore);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Failed to load transcripts.");
          setItems([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    const cutoff =
      dateFilter === "7d"
        ? Date.now() - 7 * 24 * 60 * 60 * 1000
        : dateFilter === "30d"
        ? Date.now() - 30 * 24 * 60 * 60 * 1000
        : 0;
    return items.filter((it) => {
      if (cutoff && new Date(it.startedAt).getTime() < cutoff) return false;
      if (!q) return true;
      const hay = `${it.title} ${it.meeting?.subject || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, dateFilter]);

  async function onDelete(id: string) {
    if (!confirm("Delete this transcript permanently?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/transcripts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    } catch (e) {
      alert(`Failed to delete: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function onExport(id: string, title: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/transcripts/${id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { transcript: { entries: Array<{ timestamp: string; speaker?: string; text: string }> } };
      const lines = body.transcript.entries.map((e) => {
        const ts = new Date(e.timestamp).toLocaleTimeString();
        return `[${ts}]${e.speaker ? ` ${e.speaker}:` : ""} ${e.text}`;
      });
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(title)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Failed to export: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-off-white pt-[3px]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-dark-navy leading-tight">
                Dhvani
              </span>
              <span className="text-mid-gray text-sm">ध्वनि</span>
            </div>
            <span className="text-[11px] text-mid-gray leading-tight">
              Meeting Transcription
            </span>
          </Link>
          <NavLinks isAdmin={isAdmin} />
        </div>
        <Link
          href="/"
          className="p-2 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray"
          aria-label="Settings on home page"
        >
          <Settings size={18} />
        </Link>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-dark-navy">
            Transcript history
          </h1>
        </div>

        {/* FILTERS */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-gray"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or meeting…"
              className="w-full bg-white border border-border-gray rounded pl-9 pr-3 py-2 text-sm text-dark-navy placeholder-mid-gray focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
            />
          </div>
          <div className="inline-flex rounded border border-border-gray bg-white overflow-hidden text-xs">
            {(
              [
                ["7d", "Last 7 days"],
                ["30d", "Last 30 days"],
                ["all", "All time"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                className={[
                  "px-3 py-2 font-medium transition-colors",
                  dateFilter === key
                    ? "bg-itu-blue text-white"
                    : "text-mid-gray hover:bg-light-gray",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* LIST */}
        {error && (
          <div className="rounded-lg border border-border-gray bg-white p-4 text-sm text-error mb-4">
            {error}
          </div>
        )}

        {items === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 rounded-lg bg-light-gray animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-border-gray bg-white p-10 flex flex-col items-center text-center text-mid-gray">
            <FileText size={32} className="mb-3 text-itu-blue/60" />
            <div className="text-sm font-medium text-dark-navy">
              {items.length === 0
                ? "No transcripts saved yet"
                : "No transcripts match your filters"}
            </div>
            <div className="text-xs mt-1">
              {items.length === 0
                ? "Saved sessions will appear here. Start a meeting transcription to create one."
                : "Try a different date range or search term."}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((it) => (
              <li
                key={it.id}
                className="rounded-lg border border-border-gray bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-dark-navy truncate">
                        {it.title}
                      </h3>
                      {it.meeting && (
                        <span
                          className={[
                            "text-[11px] font-medium px-1.5 py-0.5 rounded",
                            PLATFORM_BADGE_CLASS[it.meeting.platform],
                          ].join(" ")}
                        >
                          {PLATFORM_LABELS[it.meeting.platform]}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mid-gray">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(it.startedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {it.durationMinutes < 1
                          ? "<1 min"
                          : `${Math.round(it.durationMinutes)} min`}
                      </span>
                      <span>{it.chunkCount} chunks</span>
                      <span>${it.estimatedCost.toFixed(3)}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => onExport(it.id, it.title)}
                      disabled={busyId === it.id}
                      className="p-1.5 rounded text-mid-gray hover:text-itu-blue-dark hover:bg-itu-blue-pale disabled:opacity-50"
                      aria-label="Export transcript"
                      title="Export as text"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(it.id)}
                      disabled={busyId === it.id}
                      className="p-1.5 rounded text-mid-gray hover:text-error hover:bg-[#FEF2F2] disabled:opacity-50"
                      aria-label="Delete transcript"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* PAGINATION */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-between mt-5 text-xs text-mid-gray">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded bg-white border border-border-gray hover:bg-light-gray disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="px-3 py-1.5 rounded bg-white border border-border-gray hover:bg-light-gray disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "transcript";
}
