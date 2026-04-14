import { NextResponse } from "next/server";
import { createOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Public health probe for uptime monitoring. Does NOT require auth (the
 * middleware explicitly allow-lists this path). Confirms the
 * server-configured Azure OpenAI resource is reachable by listing the
 * deployments on the resource — the cheapest authenticated round-trip
 * Azure OpenAI offers.
 *
 * Response is intentionally minimal: never leak the key, endpoint, or
 * other environment details.
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
        message:
          status === 401
            ? "Azure OpenAI auth failed"
            : "Azure OpenAI unavailable",
      },
      { status: status === 401 ? 500 : status }
    );
  }
}
