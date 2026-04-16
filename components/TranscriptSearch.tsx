"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Search, User } from "lucide-react";

type SearchResult = {
  transcriptId: string;
  meetingTitle: string;
  meetingDate: string;
  entryId: string;
  timestamp: string;
  speaker: string;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
  matchCount: number;
};

type SearchResponse = {
  results: SearchResult[];
  total: number;
  page: number;
  hasMore: boolean;
  speakers: string[];
};

export default function TranscriptSearch() {
  const [query, setQuery] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(
    async (q: string, s: string, df: string, dt: string, p: number) => {
      if (!q.trim()) {
        setResults([]);
        setTotal(0);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: q.trim(), page: String(p) });
        if (s) params.set("speaker", s);
        if (df) params.set("dateFrom", df);
        if (dt) params.set("dateTo", dt);
        const res = await fetch(`/api/search?${params}`, { credentials: "include" });
        if (!res.ok) throw new Error("Search failed");
        const body = (await res.json()) as SearchResponse;
        setResults(body.results);
        setTotal(body.total);
        setHasMore(body.hasMore);
        if (body.speakers.length > 0) setSpeakers(body.speakers);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(query, speaker, dateFrom, dateTo, 1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, speaker, dateFrom, dateTo, doSearch]);

  useEffect(() => {
    if (page > 1) doSearch(query, speaker, dateFrom, dateTo, page);
  }, [page, query, speaker, dateFrom, dateTo, doSearch]);

  function highlightMatch(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const parts = text.split(new RegExp(`(${escapeRegex(q)})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-itu-blue-pale text-itu-blue-dark font-medium px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-gray" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all transcripts..."
            className="w-full bg-white border border-border-gray rounded-lg pl-9 pr-3 py-2.5 text-sm text-dark-navy placeholder-mid-gray focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
          />
        </div>
        <select
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          className="bg-white border border-border-gray rounded-lg px-3 py-2.5 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
        >
          <option value="">All speakers</option>
          {speakers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-white border border-border-gray rounded-lg px-3 py-2.5 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
          title="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-white border border-border-gray rounded-lg px-3 py-2.5 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
          title="To date"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-itu-blue" />
        </div>
      )}

      {!loading && query.trim() && results.length === 0 && (
        <div className="text-center py-8 text-mid-gray text-sm">
          No results found for &ldquo;{query}&rdquo;
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="text-xs text-mid-gray">{total} result{total !== 1 ? "s" : ""} found</div>
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li key={`${r.transcriptId}-${r.entryId}-${i}`} className="rounded-lg border border-border-gray bg-white p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText size={14} className="text-itu-blue shrink-0" />
                  <span className="text-sm font-semibold text-dark-navy truncate">{r.meetingTitle}</span>
                  <span className="text-xs text-mid-gray">{r.meetingDate}</span>
                  {r.speaker && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-itu-blue-pale text-itu-blue-dark">
                      <User size={10} />
                      {r.speaker}
                    </span>
                  )}
                  <span className="text-xs text-mid-gray font-mono">{r.timestamp}</span>
                </div>
                {r.contextBefore.length > 0 && (
                  <div className="text-xs text-mid-gray mb-1">
                    {r.contextBefore.map((c, j) => <div key={j}>...{c}</div>)}
                  </div>
                )}
                <div className="text-sm text-dark-navy">
                  {highlightMatch(r.text, query)}
                </div>
                {r.contextAfter.length > 0 && (
                  <div className="text-xs text-mid-gray mt-1">
                    {r.contextAfter.map((c, j) => <div key={j}>{c}...</div>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {(page > 1 || hasMore) && (
            <div className="flex justify-between text-xs text-mid-gray">
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
        </>
      )}
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
