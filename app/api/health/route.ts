import { NextResponse } from "next/server";
import { createOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Public health probe for uptime monitoring. Does NOT require auth (the
 * middleware explicitly allow-lists this path). Validates that the
 * server-configured OPENAI_API_KEY is usable by listing models — the
 * cheapest round-trip the OpenAI API offers.
 *
 * Response is intentionally minimal: never leak the key or environment.
 */
export async function GET() {
  try {
    const openai = createOpenAIClient();
    await openai.models.list();
    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    const status = error.status ?? 500;
    return NextResponse.json(
      {
        status: "error",
        message: status === 401 ? "Invalid API key" : "Upstream unavailable",
      },
      { status: status === 401 ? 500 : status }
    );
  }
}
