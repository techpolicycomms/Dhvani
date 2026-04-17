import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { isDemoMode } from "@/lib/demoMode";
import {
  getEmissionsReport,
  type EmissionsPeriod,
} from "@/lib/greenIct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/emissions?period=monthly|quarterly|annual&year=2026&month=4
 *
 * Returns an IPSASB SRS 1–aligned emissions report aggregated from the
 * transcription usage log and chat usage log. Admin-gated (same
 * pattern as /api/admin/usage).
 */
export async function GET(req: NextRequest) {
  if (!isDemoMode && isAuthConfigured()) {
    const session = await auth();
    const email = session?.user?.email ?? "";
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const url = req.nextUrl.searchParams;
  const period = (url.get("period") as EmissionsPeriod | null) ?? "monthly";
  const year = url.get("year") ? Number(url.get("year")) : undefined;
  const month = url.get("month") ? Number(url.get("month")) : undefined;

  try {
    const report = await getEmissionsReport(period, year, month);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[admin/emissions] failed", err);
    return NextResponse.json(
      { error: "Failed to compute emissions report." },
      { status: 500 }
    );
  }
}
