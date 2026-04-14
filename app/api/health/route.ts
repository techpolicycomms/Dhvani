import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Validates that the configured OpenAI API key is usable. Sends a minimal
 * request (list models) and returns { status, message }. The client may
 * provide its own key via the x-openai-key header; otherwise we fall back
 * to the server env var.
 */
export async function GET(req: NextRequest) {
  const clientKey = req.headers.get("x-openai-key") || undefined;

  try {
    const openai = createOpenAIClient(clientKey);
    // Cheapest possible API round-trip to confirm the key works.
    await openai.models.list();
    return NextResponse.json({
      status: "ok",
      message: "OpenAI API key is valid.",
      keySource: clientKey ? "client" : "server",
    });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    const status = error.status ?? 500;
    const message =
      status === 401
        ? "Invalid OpenAI API key."
        : error.message || "Health check failed.";
    return NextResponse.json({ status: "error", message }, { status });
  }
}
