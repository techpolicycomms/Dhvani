import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import {
  getOrgInsights,
  generateDemoRecords,
  recordAnonymisedMeeting,
  type AnonymisedMeetingRecord,
} from "@/lib/orgIntelligence";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logPath(): string {
  return (
    process.env.ORG_INSIGHTS_LOG_PATH ||
    path.join(process.cwd(), "data", "org-insights.jsonl")
  );
}

async function isLogEmpty(): Promise<boolean> {
  try {
    const stats = await fs.stat(logPath());
    return stats.size === 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return true;
    return true;
  }
}

async function seedDemoRecords(): Promise<void> {
  const p = logPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const lines = generateDemoRecords(80)
    .map((r: AnonymisedMeetingRecord) => JSON.stringify(r))
    .join("\n");
  await fs.writeFile(p, lines + "\n", "utf8");
}

/**
 * GET /api/admin/org-intelligence?period=monthly|quarterly|annual
 *
 * Aggregates anonymised meeting records and returns k-anonymity-safe
 * insights. Admin-gated. In demo mode, seeds the log with mock data
 * once so the dashboard isn't empty.
 */
export async function GET(req: NextRequest) {
  if (!isDemoMode && isAuthConfigured()) {
    const session = await auth();
    const email = session?.user?.email ?? "";
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (isDemoMode && (await isLogEmpty())) {
    try {
      await seedDemoRecords();
    } catch (err) {
      console.warn("[admin/org-intelligence] demo seed failed", err);
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
