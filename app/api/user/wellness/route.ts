import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { readAllUsage } from "@/lib/usageLogger";
import { assessWellness, DEFAULT_WELLNESS_CONFIG } from "@/lib/meetingWellness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86400_000;
const DAY_MS = 86400_000;

export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const records = (await readAllUsage()).filter((r) => r.userId === user.userId);
  const now = Date.now();
  const weekStart = now - WEEK_MS;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const weekly = records.filter(
    (r) => new Date(r.timestamp).getTime() >= weekStart
  );
  const weeklyHours =
    weekly.reduce((s, r) => s + (r.audioDurationSeconds || 0), 0) / 3600;
  const weeklyCount = countMeetings(weekly);

  const today = records.filter(
    (r) => new Date(r.timestamp).getTime() >= dayStart.getTime()
  );
  const todayHours =
    today.reduce((s, r) => s + (r.audioDurationSeconds || 0), 0) / 3600;
  const todayCount = countMeetings(today);
  const consecutive = longestContiguous(today);

  const report = assessWellness(
    { hours: +weeklyHours.toFixed(2), count: weeklyCount },
    { hours: +todayHours.toFixed(2), count: todayCount, consecutiveHours: +consecutive.toFixed(2) },
    DEFAULT_WELLNESS_CONFIG
  );
  return NextResponse.json({ wellness: report });
}

function countMeetings(rs: Array<{ timestamp: string }>): number {
  const sorted = [...rs].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : 1
  );
  let n = 0;
  let prev = -Infinity;
  for (const r of sorted) {
    const t = new Date(r.timestamp).getTime();
    if (t - prev > 5 * 60 * 1000) n += 1;
    prev = t;
  }
  return n;
}

function longestContiguous(rs: Array<{ timestamp: string; audioDurationSeconds: number }>): number {
  if (rs.length === 0) return 0;
  const sorted = [...rs].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : 1
  );
  let longestH = 0;
  let runStart = new Date(sorted[0].timestamp).getTime();
  let runEnd = runStart + (sorted[0].audioDurationSeconds || 0) * 1000;
  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].timestamp).getTime();
    if (t - runEnd <= 15 * 60 * 1000) {
      runEnd = t + (sorted[i].audioDurationSeconds || 0) * 1000;
    } else {
      longestH = Math.max(longestH, (runEnd - runStart) / 3_600_000);
      runStart = t;
      runEnd = t + (sorted[i].audioDurationSeconds || 0) * 1000;
    }
  }
  return Math.max(longestH, (runEnd - runStart) / 3_600_000);
}
