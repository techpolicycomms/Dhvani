import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth";
import { whisperDeployment } from "@/lib/openai";
import {
  checkAndReserve,
  isServiceEnabled,
  release,
} from "@/lib/rateLimiter";
import { costFromSeconds, logUsage } from "@/lib/usageLogger";
import { getAIProvider } from "@/lib/providers";
import { events } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isUnsupportedAudioChunkError(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const msg = (e.message || "").toLowerCase();
  return (
    e.status === 400 &&
    (msg.includes("audio file might be corrupted") ||
      msg.includes("unsupported") ||
      msg.includes("invalid file format"))
  );
}

/**
 * POST /api/transcribe
 *
 * Centralized org transcription endpoint. Key differences from the
 * previous BYO-key version:
 *   - Requires a valid Microsoft SSO session (middleware enforces this
 *     up front; we also re-check here for defense-in-depth).
 *   - Audio is transcribed against the tenant's Azure OpenAI resource
 *     (AZURE_OPENAI_ENDPOINT). The API key lives only in
 *     process.env.AZURE_OPENAI_API_KEY — clients cannot supply one.
 *   - Every successful call is logged to the JSONL usage log with the
 *     authenticated user's identity.
 *   - Per-user hourly/daily caps and the org monthly budget are enforced
 *     before Whisper is called.
 *   - The admin kill-switch (SERVICE_ENABLED=false) returns 503.
 */
export async function POST(req: NextRequest) {
  if (!isServiceEnabled()) {
    return NextResponse.json(
      { error: "Dhvani is temporarily disabled by the administrator." },
      { status: 503 }
    );
  }

  // Accept the NextAuth session cookie (web app) OR the x-auth-token
  // header (Chrome extension), so the same route serves both.
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId;

  const languageHint = req.headers.get("x-language") || undefined;
  // Client hints how long the chunk is so we can rate-limit before we
  // actually decode the file. It's best-effort; we re-calculate post-
  // response if Whisper returned a different duration (verbose_json).
  const declaredSeconds = parseFloat(
    req.headers.get("x-audio-seconds") || "5"
  );
  const estimatedSeconds =
    Number.isFinite(declaredSeconds) && declaredSeconds > 0
      ? declaredSeconds
      : 5;

  // Reserve quota before parsing the body so noisy clients are cut off
  // cheaply. If Whisper fails we'll `release()` the reservation below.
  const quota = await checkAndReserve(userId, estimatedSeconds);
  if (!quota.allowed) {
    const retryAfter = quota.retryAfterSeconds ?? 60;
    const headers = new Headers({ "Retry-After": String(retryAfter) });
    const message =
      quota.reason === "org-month"
        ? "Monthly transcription budget reached. Contact IT."
        : `You've reached your transcription limit. Try again in ${Math.ceil(
            retryAfter / 60
          )} minute(s).`;
    return NextResponse.json(
      { error: message, reason: quota.reason, retryAfterSeconds: retryAfter, quota },
      { status: 429, headers }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) {
      release(userId, estimatedSeconds);
      return NextResponse.json(
        { error: "Expected multipart/form-data with a 'file' field." },
        { status: 400 }
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      release(userId, estimatedSeconds);
      return NextResponse.json(
        { error: "Missing 'file' field in multipart body." },
        { status: 400 }
      );
    }
    if (file.size > 25 * 1024 * 1024) {
      release(userId, estimatedSeconds);
      return NextResponse.json(
        { error: "Audio file too large (max 25 MB per chunk)." },
        { status: 413 }
      );
    }
    if (file.type && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      release(userId, estimatedSeconds);
      return NextResponse.json(
        { error: "Invalid file type. Expected an audio file." },
        { status: 400 }
      );
    }

    const ai = getAIProvider();
    events.emit({
      type: "transcription.started",
      meetingSubject: req.headers.get("x-meeting-subject"),
      userId,
    });

    const result = await ai.transcribe(file, { language: languageHint });

    // Provider returns already-normalised segments; keep as a mutable
    // local so the synthetic-segment fallback below can augment it.
    let segments = result.segments.slice();

    // When response_format=json returns only plain text, emit one synthetic
    // segment so the client pipeline remains stable (single speaker fallback).
    if (segments.length === 0 && (result.text || "").trim()) {
      segments = [
        {
          speaker: "speaker_0",
          text: (result.text || "").trim(),
          start: 0,
          end: estimatedSeconds,
        },
      ];
    }

    const chunkId = req.headers.get("x-chunk-id") || `${Date.now()}`;
    const whisperCost = costFromSeconds(estimatedSeconds);
    await logUsage({
      userId,
      email: user.email,
      name: user.name ?? null,
      timestamp: new Date().toISOString(),
      audioDurationSeconds: estimatedSeconds,
      whisperCost,
      chunkId,
    });

    events.emit({
      type: "transcription.completed",
      transcriptId: chunkId,
      userId,
      durationSeconds: estimatedSeconds,
    });

    return NextResponse.json({
      text: result.text ?? "",
      segments,
      language: result.language ?? languageHint ?? null,
      remaining: quota.remaining,
    });
  } catch (err: unknown) {
    // Refund the reservation — this audio was never successfully billed.
    release(userId, estimatedSeconds);
    const error = err as { status?: number; message?: string };
    const status = error.status || 500;
    // Some browsers occasionally emit malformed/tiny chunks. Treat these
    // as non-fatal and skip the chunk so the meeting can continue.
    if (isUnsupportedAudioChunkError(err)) {
      return NextResponse.json({
        text: "",
        segments: [],
        language: languageHint ?? null,
        remaining: quota.remaining,
        skipped: true,
      });
    }
    if (status === 401) {
      return NextResponse.json(
        { error: "Transcription service is misconfigured. Please contact your administrator." },
        { status: 500 }
      );
    }
    if (status === 429) {
      return NextResponse.json(
        { error: "Upstream rate limit hit. Please retry shortly." },
        { status: 429 }
      );
    }
    if (status === 413) {
      return NextResponse.json(
        { error: "Audio file too large." },
        { status: 413 }
      );
    }
    if (status === 404) {
      return NextResponse.json(
        {
          error: `Transcription deployment "${whisperDeployment()}" was not found on this Azure OpenAI resource. Check AZURE_OPENAI_WHISPER_DEPLOYMENT.`,
        },
        { status: 404 }
      );
    }
    // Preserve the known-safe error messages we construct ourselves
    // above; for everything else, return a generic message so Azure /
    // stack-trace details never leak to the client.
    return NextResponse.json(
      { error: "Transcription failed." },
      { status }
    );
  }
}
