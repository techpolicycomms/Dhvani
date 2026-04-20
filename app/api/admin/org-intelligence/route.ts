import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import {
  getOrgInsights,
  recordAnonymisedMeeting,
  type AnonymisedMeetingRecord,
} from "@/lib/orgIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/org-intelligence?period=monthly|quarterly|annual
 *
 * Aggregates anonymised meeting records and returns k-anonymity-safe
 * insights. Admin-gated.
 */
export async function GET(req: NextRequest) {
  if (isAuthConfigured()) {
    const session = await auth();
    const email = session?.user?.email ?? "";
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const period =
    (req.nextUrl.searchParams.get("period") as
      | "monthly"
      | "quarterly"
      | "annual"
      | null) ?? "monthly";

  try {
    const insights = await getOrgInsights(period);
    return NextResponse.json(insights);
  } catch (err) {
    console.error("[admin/org-intelligence] failed", err);
    return NextResponse.json(
      { error: "Failed to compute org insights." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/org-intelligence
 *
 * Called by the summarize route (server-to-server) when the user has
 * opted in to anonymous contribution. Payload is already fully
 * anonymised — no user identity reaches this handler.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AnonymisedMeetingRecord> & {
      timestamp?: string;
    };
    await recordAnonymisedMeeting({
      timestamp: body.timestamp || new Date().toISOString(),
      department: body.department || "Unknown",
      durationMinutes: body.durationMinutes || 0,
      topicKeywords: body.topicKeywords || [],
      sentiment: body.sentiment || "Neutral",
      actionItemCount: body.actionItemCount || 0,
      speakerCount: body.speakerCount || 0,
      languageUsed: body.languageUsed || "unknown",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/org-intelligence] POST failed", err);
    return NextResponse.json(
      { error: "Failed to record anonymised meeting." },
      { status: 500 }
    );
  }
}
