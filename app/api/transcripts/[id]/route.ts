import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { deleteTranscript, getTranscript } from "@/lib/transcriptStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/transcripts/[id]
 *
 * Returns a single saved transcript belonging to the signed-in user.
 * 404s for ids the caller doesn't own — we never reveal that another
 * user has a transcript with that id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId || user.email;

  try {
    const transcript = await getTranscript(userId, id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load transcript." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/transcripts/[id]
 *
 * Removes the transcript file. Idempotent — deleting an already-missing
 * id still returns 200.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId || user.email;

  try {
    const removed = await deleteTranscript(userId, id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to delete transcript." },
      { status: 500 }
    );
  }
}
