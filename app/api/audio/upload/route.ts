import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import {
  isAudioBlobBackendEnabled,
  readAudioManifest,
  uploadAudioChunk,
  writeAudioManifest,
  type AudioSessionManifest,
} from "@/lib/azureBlobAudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/audio/upload
 *
 * Placeholder endpoint for Azure Blob voice-recording archival. OFF by
 * default. Flips on when DHVANI_AUDIO_STORAGE=blob AND the shared Azure
 * storage creds are present. See docs/AZURE_BLOB_AUDIO_SETUP.md.
 *
 * Request (multipart/form-data):
 *   file         — audio/webm chunk blob
 *   sessionId    — string, matches OPFS session id
 *   chunkIndex   — integer, zero-based
 *   mimeType     — e.g. "audio/webm"
 *   extension    — e.g. "webm"
 *   startedAtIso — ISO timestamp of recording start (first call wins)
 *   transcriptId — optional, backlink once the transcript is saved
 *
 * Response:
 *   { ok: true, bytes }     — on success
 *   { ok: true, disabled }  — when the backend is off; client keeps the
 *                             chunk in OPFS only (no behaviour change)
 */
export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAudioBlobBackendEnabled()) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const form = await req.formData();
  const file = form.get("file");
  const sessionId = String(form.get("sessionId") || "");
  const chunkIndexRaw = String(form.get("chunkIndex") || "");
  const mimeType = String(form.get("mimeType") || "audio/webm");
  const extension = String(form.get("extension") || "webm");
  const startedAtIso =
    String(form.get("startedAtIso") || "") || new Date().toISOString();
  const transcriptId = (form.get("transcriptId") as string) || undefined;

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Missing `file`." },
      { status: 400 }
    );
  }
  const chunkIndex = parseInt(chunkIndexRaw, 10);
  if (!sessionId || Number.isNaN(chunkIndex)) {
    return NextResponse.json(
      { error: "Missing or invalid sessionId / chunkIndex." },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { path, bytes } = await uploadAudioChunk(
    user.userId,
    sessionId,
    chunkIndex,
    buf,
    mimeType
  );

  // Upsert manifest — cheap because each session's manifest is a single
  // blob. We could batch but chunks arrive at 1.5s cadence; cost is trivial.
  const existing = await readAudioManifest(user.userId, sessionId);
  const manifest: AudioSessionManifest = {
    userId: user.userId,
    sessionId,
    startedAt: existing?.startedAt || startedAtIso,
    mimeType,
    extension,
    totalBytes: (existing?.totalBytes || 0) + bytes,
    chunkCount: Math.max(existing?.chunkCount || 0, chunkIndex + 1),
    transcriptId: transcriptId || existing?.transcriptId,
  };
  await writeAudioManifest(manifest);

  return NextResponse.json({ ok: true, path, bytes });
}
