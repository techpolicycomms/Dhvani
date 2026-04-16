import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { getTranscript } from "@/lib/transcriptStorage";
import { createShare, deleteShare } from "@/lib/shareStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transcript = await getTranscript(user.userId, params.id);
  if (!transcript) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: { expiresIn?: string; requireAuth?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const expiresIn = (["24h", "7d", "30d", "never"] as const).includes(body.expiresIn as never)
    ? (body.expiresIn as "24h" | "7d" | "30d" | "never")
    : "7d";
  const requireAuth = body.requireAuth !== false;

  const share = await createShare(params.id, user.userId, expiresIn, requireAuth);
  const origin = req.nextUrl.origin;
  const shareUrl = `${origin}/shared/${share.token}`;

  return NextResponse.json({ share, shareUrl }, { status: 201 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = params.id;
  const removed = await deleteShare(token, user.userId);
  return NextResponse.json({ ok: true, removed });
}
