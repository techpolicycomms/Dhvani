import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { listTranscripts, getTranscript } from "@/lib/transcriptStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

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

export async function GET(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const q = (params.get("q") || "").trim().toLowerCase();
  if (!q) {
    return NextResponse.json({ results: [], total: 0 });
  }
  if (q.length > 500) {
    return NextResponse.json({ error: "Query too long." }, { status: 400 });
  }

  const speakerFilter = (params.get("speaker") || "").trim().toLowerCase();
  const dateFrom = params.get("dateFrom") || "";
  const dateTo = params.get("dateTo") || "";
  const pageParam = parseInt(params.get("page") || "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const dateFromMs = dateFrom ? Date.parse(dateFrom) : 0;
  const dateToMs = dateTo ? Date.parse(dateTo) : Infinity;

  const allMeta = await listTranscripts(user.userId);
  const results: SearchResult[] = [];
  const allSpeakers = new Set<string>();

  for (const meta of allMeta) {
    const startMs = Date.parse(meta.startedAt);
    if (startMs < dateFromMs || startMs > dateToMs) continue;

    const transcript = await getTranscript(user.userId, meta.id);
    if (!transcript) continue;

    const entries = transcript.entries;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const id = e.stableSpeakerId || e.rawSpeaker;
      const speaker = (id && transcript.speakerNames?.[id]) || e.speaker || "";
      if (speaker) allSpeakers.add(speaker);

      if (speakerFilter && speaker.toLowerCase() !== speakerFilter) continue;

      const text = e.text.toLowerCase();
      if (!text.includes(q)) continue;

      const matchCount = text.split(q).length - 1;
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];
      for (let j = Math.max(0, i - 2); j < i; j++) {
        contextBefore.push(entries[j].text);
      }
      for (let j = i + 1; j <= Math.min(entries.length - 1, i + 2); j++) {
        contextAfter.push(entries[j].text);
      }

      results.push({
        transcriptId: meta.id,
        meetingTitle: meta.title,
        meetingDate: meta.startedAt.slice(0, 10),
        entryId: e.id,
        timestamp: e.timestamp,
        speaker,
        text: e.text,
        contextBefore,
        contextAfter,
        matchCount,
      });
    }
  }

  results.sort((a, b) => b.matchCount - a.matchCount || b.meetingDate.localeCompare(a.meetingDate));

  const start = (page - 1) * PAGE_SIZE;
  const paged = results.slice(start, start + PAGE_SIZE);

  return NextResponse.json({
    results: paged,
    total: results.length,
    page,
    hasMore: start + paged.length < results.length,
    speakers: Array.from(allSpeakers).sort(),
  });
}
