import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listTranscripts,
  newTranscriptId,
  saveTranscript,
  type SavedTranscript,
} from "@/lib/transcriptStorage";
import type { TranscriptEntry } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * GET /api/transcripts?page=1
 *
 * Lists the signed-in user's saved transcripts (newest first), paginated
 * 20 per page. Returns metadata only — the transcript text is loaded by
 * /api/transcripts/[id] on demand.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId || user.email;

  const pageParam = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  try {
    const all = await listTranscripts(userId);
    const start = (page - 1) * PAGE_SIZE;
    const items = all.slice(start, start + PAGE_SIZE);
    return NextResponse.json({
      items,
      page,
      pageSize: PAGE_SIZE,
      total: all.length,
      hasMore: start + items.length < all.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to list transcripts." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/transcripts
 *
 * Body: { entries, startedAt, endedAt, durationMinutes, chunkCount,
 *         estimatedCost, title?, meeting?, speakerNames? }
 *
 * Creates a new saved transcript file under the user's folder. Returns
 * the assigned id + full record.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId || user.email;

  let body: Partial<SavedTranscript>;
  try {
    body = (await req.json()) as Partial<SavedTranscript>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const entries = Array.isArray(body.entries)
    ? (body.entries as TranscriptEntry[])
    : null;
  if (!entries || entries.length === 0) {
    return NextResponse.json(
      { error: "entries[] is required." },
      { status: 400 }
    );
  }

  const startedAt = typeof body.startedAt === "string" ? body.startedAt : "";
  const endedAt = typeof body.endedAt === "string" ? body.endedAt : "";
  if (!startedAt || !endedAt) {
    return NextResponse.json(
      { error: "startedAt and endedAt are required." },
      { status: 400 }
    );
  }

  const id = newTranscriptId();
  const title =
    (typeof body.title === "string" && body.title.trim()) ||
    body.meeting?.subject ||
    new Date(startedAt).toLocaleString();

  try {
    const saved = await saveTranscript(userId, {
      id,
      title,
      startedAt,
      endedAt,
      durationMinutes:
        typeof body.durationMinutes === "number" ? body.durationMinutes : 0,
      chunkCount:
        typeof body.chunkCount === "number" ? body.chunkCount : entries.length,
      estimatedCost:
        typeof body.estimatedCost === "number" ? body.estimatedCost : 0,
      meeting: body.meeting,
      entries,
      speakerNames: body.speakerNames,
    });
    return NextResponse.json({ transcript: saved }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to save transcript." },
      { status: 500 }
    );
  }
}
