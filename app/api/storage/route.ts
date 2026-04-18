import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { activeBackend } from "@/lib/transcriptStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns which backend is storing transcripts. Used by the Settings
 * drawer to show users where their data lives.
 */
export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    backend: activeBackend(),
    container:
      activeBackend() === "azure-blob"
        ? process.env.AZURE_STORAGE_CONTAINER || "dhvani-transcripts"
        : null,
  });
}
