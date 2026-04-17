import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { readAllUsage, type UsageRecord } from "@/lib/usageLogger";
import { listTasks } from "@/lib/taskManager";
import { buildMissionStats } from "@/lib/gamification";
import { getUserEmissions } from "@/lib/greenIct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86400_000;
const DAY_MS = 86400_000;

export async function GET() {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All usage for this user.
  const allUsage: UsageRecord[] = (await readAllUsage()).filter(
    (r) => r.userId === user.userId
  );
  const tasks = await listTasks(user.userId);
  const emissions = await getUserEmissions(user.userId, 30);

  const totalMinutes = allUsage.reduce(
    (s, r) => s + (r.audioDurationSeconds || 0) / 60,
    0
  );
  // One meeting = a burst of chunks within a contiguous window. Simple
  // approximation: cluster by 5-minute-gap boundaries.
  const sorted = [...allUsage].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : 1
  );
  let meetings = 0;
  let prev = -Infinity;
  for (const r of sorted) {
    const t = new Date(r.timestamp).getTime();
    if (t - prev > 5 * 60 * 1000) meetings += 1;
    prev = t;
  }

  // Current week bucket.
  const now = Date.now();
  const weekStart = now - WEEK_MS;
  const weekRecords = sorted.filter(
    (r) => new Date(r.timestamp).getTime() >= weekStart
  );
  const currentWeekMinutes = weekRecords.reduce(
    (s, r) => s + (r.audioDurationSeconds || 0) / 60,
    0
  );
  let currentWeekMeetings = 0;
  {
    let p = -Infinity;
    for (const r of weekRecords) {
      const t = new Date(r.timestamp).getTime();
      if (t - p > 5 * 60 * 1000) currentWeekMeetings += 1;
      p = t;
    }
  }

  // Streak: count distinct day strings ending today going backwards.
  const dayStrs = new Set(
    sorted.map((r) => r.timestamp.slice(0, 10))
  );
  let streakDays = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    if (dayStrs.has(d)) streakDays++;
    else if (i === 0) continue; // allow a gap today (user hasn't transcribed yet)
    else break;
  }

  const completed = tasks.filter((t) => t.status === "completed").length;

  const stats = buildMissionStats({
    totalMeetingsTranscribed: meetings,
    totalMinutesTranscribed: Math.round(totalMinutes),
    totalActionItemsCreated: tasks.length,
    totalActionItemsCompleted: completed,
    // Summaries tracked separately in the chat-usage log — approximated
    // here by counting completed tasks whose meetingId is set (each
    // summary emits task records); good enough for v1, refine later.
    totalSummariesGenerated: new Set(
      tasks.filter((t) => t.meetingId).map((t) => t.meetingId)
    ).size,
    streakDays,
    currentWeekMeetings,
    currentWeekMinutes: Math.round(currentWeekMinutes),
    uniqueLanguages: 1, // usage log doesn't capture per-chunk language yet
    monthlyCarbonGrams: emissions.carbonGrams,
  });

  return NextResponse.json({ stats });
}
