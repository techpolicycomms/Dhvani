import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/rateLimiter";
import { readAllUsage } from "@/lib/usageLogger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/usage
 *
 * Returns the signed-in user's personal usage and remaining quota. Used
 * by the in-app "X min remaining today" indicator and the per-user view
 * in SettingsDrawer.
 */
export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.userId;

  const snap = await getQuotaSnapshot(userId);
  const records = (await readAllUsage()).filter((r) => r.userId === userId);

  let todayMinutes = 0;
  let monthMinutes = 0;
  let totalMinutes = 0;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).getTime();

  for (const r of records) {
    const m = r.audioDurationSeconds / 60;
    totalMinutes += m;
    if (r.timestamp.slice(0, 10) === today) todayMinutes += m;
    if (new Date(r.timestamp).getTime() >= monthStart) monthMinutes += m;
  }

  return NextResponse.json({
    name: user.name ?? null,
    email: user.email,
    usage: {
      todayMinutes,
      monthMinutes,
      totalMinutes,
    },
    quota: snap,
  });
}
