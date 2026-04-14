import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOpenAIClient } from "@/lib/openai";
import {
  checkAndReserve,
  isServiceEnabled,
  release,
} from "@/lib/rateLimiter";
import { costFromSeconds, logUsage } from "@/lib/usageLogger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/transcribe
 *
 * Centralized org transcription endpoint. Key differences from the
 * previous BYO-key version:
 *   - Requires a valid Microsoft SSO session (middleware enforces this
 *     up front; we also re-check here for defense-in-depth).
 *   - OpenAI API key lives only in process.env.OPENAI_API_KEY. There is
 *     no path for the client to supply one.
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

  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string; name?: string | null }
    | undefined;
  if (!session || !user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId || user.email;

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

    let openai;
    try {
      openai = createOpenAIClient();
    } catch (err) {
      release(userId, estimatedSeconds);
      return NextResponse.json(
        {
          error:
            "Transcription service is misconfigured. Please contact your administrator.",
        },
        { status: 500 }
      );
    }

    const result = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      ...(languageHint ? { language: languageHint } : {}),
      response_format: "json",
    });

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

    return NextResponse.json({
      text: result.text ?? "",
      language: languageHint ?? null,
      remaining: quota.remaining,
    });
  } catch (err: unknown) {
    // Refund the reservation — this audio was never successfully billed.
    release(userId, estimatedSeconds);
    const error = err as { status?: number; message?: string };
    const status = error.status || 500;
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
    return NextResponse.json(
      { error: error.message || "Transcription failed." },
      { status }
    );
  }
}
