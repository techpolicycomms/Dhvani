import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listTranscripts,
  newTranscriptId,
  saveTranscript,
  type SavedTranscript,
} from "@/lib/transcriptStorage";
import {
  WHISPER_PRICE_PER_MINUTE,
  type TranscriptEntry,
} from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Anti-abuse caps. A real recorded session is ~one entry per second of
// audio at most; even an 8-hour meeting yields well under 30k entries.
const MAX_ENTRIES = 50_000;
const MAX_TEXT_PER_ENTRY = 4_000; // characters
const MAX_TITLE = 250;
// Per-user save quota — cheap brake on disk-fill DoS. The cap is
// generous (a heavy user creates ~5–10 transcripts/day); the goal is to
// stop a runaway client from writing tens of thousands of files.
const MAX_SAVES_PER_DAY = 50;

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

  const rawEntries = Array.isArray(body.entries) ? body.entries : null;
  if (!rawEntries || rawEntries.length === 0) {
    return NextResponse.json(
      { error: "entries[] is required." },
      { status: 400 }
    );
  }
  if (rawEntries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { error: `Too many entries (max ${MAX_ENTRIES}).` },
      { status: 413 }
    );
  }

  // Sanitise + cap each entry. We don't trust the client to keep text
  // small — a single 100MB entry would otherwise sit on disk forever.
  const entries: TranscriptEntry[] = [];
  for (const e of rawEntries) {
    if (!e || typeof e !== "object") continue;
    const ent = e as Partial<TranscriptEntry>;
    if (typeof ent.id !== "string" || typeof ent.text !== "string") continue;
    entries.push({
      id: ent.id.slice(0, 64),
      timestamp:
        typeof ent.timestamp === "string"
          ? ent.timestamp.slice(0, 32)
          : new Date().toISOString(),
      text: ent.text.slice(0, MAX_TEXT_PER_ENTRY),
      rawSpeaker:
        typeof ent.rawSpeaker === "string"
          ? ent.rawSpeaker.slice(0, 64)
          : undefined,
      speaker:
        typeof ent.speaker === "string" ? ent.speaker.slice(0, 64) : undefined,
    });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid entries." }, { status: 400 });
  }

  const startedAt = typeof body.startedAt === "string" ? body.startedAt : "";
  const endedAt = typeof body.endedAt === "string" ? body.endedAt : "";
  if (!startedAt || !endedAt) {
    return NextResponse.json(
      { error: "startedAt and endedAt are required." },
      { status: 400 }
    );
  }
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return NextResponse.json(
      { error: "Invalid startedAt/endedAt." },
      { status: 400 }
    );
  }

  // Derive duration + cost from the actual time window — don't trust the
  // client-supplied numbers, which would let a malicious caller poison
  // the admin usage view by inflating estimatedCost / durationMinutes.
  const durationMinutes = Math.min(
    24 * 60, // hard cap at 24h per saved transcript
    Math.max(0, (endMs - startMs) / 60_000)
  );
  const estimatedCost = durationMinutes * WHISPER_PRICE_PER_MINUTE;

  // Per-user daily save quota. Listing the directory is cheap (no entry
  // text loaded — listTranscripts strips it) and bounded by MAX_SAVES_PER_DAY.
  try {
    const existing = await listTranscripts(userId);
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = existing.filter(
      (it) => new Date(it.startedAt).getTime() >= since
    ).length;
    if (recent >= MAX_SAVES_PER_DAY) {
      return NextResponse.json(
        {
          error: `Save quota reached (${MAX_SAVES_PER_DAY}/day). Delete older transcripts to free space.`,
        },
        { status: 429 }
      );
    }
  } catch {
    // listing failed (filesystem) — fail open rather than block saves.
  }

  const id = newTranscriptId();
  const title = (
    (typeof body.title === "string" && body.title.trim()) ||
    body.meeting?.subject ||
    new Date(startedAt).toLocaleString()
  ).slice(0, MAX_TITLE);

  try {
    const saved = await saveTranscript(userId, {
      id,
      title,
      startedAt,
      endedAt,
      durationMinutes,
      chunkCount: entries.length,
      estimatedCost,
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
