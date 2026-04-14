import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Whisper accepts files up to 25 MB.
export const maxDuration = 60;

/**
 * POST /api/transcribe
 *
 * Proxies an audio blob to OpenAI Whisper and returns { text, language }.
 * The API key is resolved in this priority order:
 *   1. x-openai-key request header (client-provided, stored only in their
 *      browser's localStorage — never persisted server-side)
 *   2. OPENAI_API_KEY environment variable
 *
 * CRITICAL: We never echo the key back to the client. Errors are sanitized.
 */
export async function POST(req: NextRequest) {
  try {
    const clientKey = req.headers.get("x-openai-key") || undefined;
    const languageHint = req.headers.get("x-language") || undefined;

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in multipart body." },
        { status: 400 }
      );
    }

    // Whisper maximum upload size is 25 MB.
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio file too large (max 25 MB per chunk)." },
        { status: 413 }
      );
    }

    let openai;
    try {
      openai = createOpenAIClient(clientKey);
    } catch (err: unknown) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 401 }
      );
    }

    const result = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      // An empty language hint means auto-detect.
      ...(languageHint ? { language: languageHint } : {}),
      response_format: "json",
    });

    return NextResponse.json({
      text: result.text ?? "",
      // The basic json response_format doesn't return language; auto-detect
      // surfaces it only via verbose_json. Return the hint for round-trip.
      language: languageHint ?? null,
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string; code?: string };
    const status = error.status || 500;

    if (status === 401) {
      return NextResponse.json(
        { error: "Invalid or expired OpenAI API key." },
        { status: 401 }
      );
    }
    if (status === 429) {
      return NextResponse.json(
        { error: "Rate limited by OpenAI. Please retry shortly." },
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
