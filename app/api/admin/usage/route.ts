import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { readAllUsage } from "@/lib/usageLogger";
import { aggregate, toCsv } from "@/lib/usageAggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/usage
 *
 * Returns aggregated usage statistics for the admin dashboard.
 * Protected by the ADMIN_EMAILS allowlist — a signed-in non-admin user
 * gets a 403.
 *
 * Query params:
 *   ?format=csv  — stream the raw usage log as CSV (for spreadsheet export)
 */
export async function GET(req: NextRequest) {
  // Strictly disabled without SSO — no way to verify admin identity.
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format");
  const records = await readAllUsage();

  if (format === "csv") {
    const csv = toCsv(records);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="dhvani-usage-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json(aggregate(records));
}
