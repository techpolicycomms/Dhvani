import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { getAIProvider } from "@/lib/providers";
import { checkChatRate } from "@/lib/rateLimiter";
import { logSecurityEvent } from "@/lib/security";
import {
  classifyUrl,
  fetchRemoteMedia,
  validateUrl,
  MAX_REMOTE_BYTES,
} from "@/lib/urlFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/url-transcribe
 *
 * Body: { url: string, language?: string }
 *
 * v1 scope:
 *   - Direct audio/video URLs (https, audio/* or video/* content-type,
 *     ≤ 25 MB — the Azure OpenAI transcription limit).
 *   - YouTube / Google Drive / Vimeo return 501 with a clear message
 *     because they need a separate extractor library (ytdl-core for
 *     YouTube; the Drive share→download rewrite for Drive) — both have
 *     operational concerns (ToS for ytdl; export limits for Drive)
 *     that need a deliberate decision before shipping.
 *
 * Progress: the route is synchronous — caller polls this endpoint or
 * just waits. Streaming progress via SSE is a v2 concern.
 */
export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkChatRate(user.userId);
  if (!rate.allowed) {
    logSecurityEvent({
      type: "rate_limit",
      userId: user.userId,
      details: `url-transcribe rate limit — retry in ${rate.retryAfterSeconds}s`,
    });
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  let body: { url?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const url = (body.url || "").trim();
  const languageHint = body.language?.trim() || undefined;
  if (!url) {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  const v = validateUrl(url);
  if (!v.ok) {
    logSecurityEvent({
      type: "invalid_input",
      userId: user.userId,
      details: `url-transcribe rejected: ${v.reason}`,
    });
    return NextResponse.json({ error: v.reason }, { status: 400 });
  }

  const kind = classifyUrl(url);
  if (kind === "youtube" || kind === "gdrive" || kind === "vimeo") {
    return NextResponse.json(
      {
        error:
          `${kind === "youtube" ? "YouTube" : kind === "gdrive" ? "Google Drive" : "Vimeo"} ` +
          "URLs are coming soon. For now, download the audio file and paste the direct .mp3/.mp4 URL, or use /upload.",
        kind,
        supported: false,
      },
      { status: 501 }
    );
  }

  let media: Awaited<ReturnType<typeof fetchRemoteMedia>>;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      media = await fetchRemoteMedia(url, controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message = (err as Error).message || "Failed to fetch URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Hand the bytes to the AI provider as if they were a file upload.
  // `File` is available in Node 20+. We construct a fresh ArrayBuffer
  // to satisfy TS's SharedArrayBuffer-narrowing check.
  const ab = new ArrayBuffer(media.bytes.byteLength);
  new Uint8Array(ab).set(media.bytes);
  const file = new File([ab], media.filename, {
    type: media.contentType,
  });

  try {
    const ai = getAIProvider();
    const result = await ai.transcribe(file, { language: languageHint });
    return NextResponse.json({
      text: result.text,
      segments: result.segments,
      language: result.language,
      source: {
        url,
        bytes: media.bytes.byteLength,
        contentType: media.contentType,
        limitBytes: MAX_REMOTE_BYTES,
      },
    });
  } catch (err) {
    console.error("[url-transcribe] transcription failed:", (err as Error).message);
    return NextResponse.json(
      { error: "Transcription failed. The file may be corrupted or in an unsupported format." },
      { status: 500 }
    );
  }
}
