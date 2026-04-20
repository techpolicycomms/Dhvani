import { NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR =
  process.env.DHVANI_DATA_DIR ||
  path.join(process.cwd(), "data", "transcripts");

type TranscriptFile = {
  id: string;
  userId: string;
  title: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  chunkCount: number;
  estimatedCost: number;
  entries: Array<{
    rawSpeaker?: string;
    stableSpeakerId?: string;
    speaker?: string;
    text: string;
  }>;
  speakerNames?: Record<string, string>;
  summary?: string;
  meeting?: { platform: string; subject: string };
};

export async function GET() {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured." }, { status: 403 });
  }
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let userDirs: string[];
  try {
    userDirs = await fs.readdir(DATA_DIR);
  } catch {
    return NextResponse.json(emptyStats());
  }

  const transcripts: TranscriptFile[] = [];
  for (const dir of userDirs) {
    if (dir.startsWith("_")) continue;
    const userPath = path.join(DATA_DIR, dir);
    const stat = await fs.stat(userPath).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const files = await fs.readdir(userPath).catch(() => [] as string[]);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(userPath, file), "utf8");
        transcripts.push(JSON.parse(raw));
      } catch { /* skip corrupt */ }
    }
  }

  const totalMeetings = transcripts.length;
  let totalMinutes = 0;
  let totalWords = 0;
  const uniqueUsers = new Set<string>();
  const platformCounts: Record<string, number> = {};
  const weekdayCounts = new Array(7).fill(0) as number[];
  const hourCounts = new Array(24).fill(0) as number[];
  const monthlyMeetings: Record<string, number> = {};
  const durationBuckets = { under5: 0, "5to15": 0, "15to30": 0, "30to60": 0, over60: 0 };
  const speakerSet = new Set<string>();

  for (const t of transcripts) {
    totalMinutes += t.durationMinutes || 0;
    uniqueUsers.add(t.userId);

    const platform = t.meeting?.platform || "unknown";
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;

    const d = new Date(t.startedAt);
    if (!isNaN(d.getTime())) {
      weekdayCounts[d.getDay()]++;
      hourCounts[d.getHours()]++;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMeetings[monthKey] = (monthlyMeetings[monthKey] || 0) + 1;
    }

    const dur = t.durationMinutes || 0;
    if (dur < 5) durationBuckets.under5++;
    else if (dur < 15) durationBuckets["5to15"]++;
    else if (dur < 30) durationBuckets["15to30"]++;
    else if (dur < 60) durationBuckets["30to60"]++;
    else durationBuckets.over60++;

    if (t.entries) {
      for (const e of t.entries) {
        totalWords += (e.text || "").split(/\s+/).filter(Boolean).length;
        const lookupId = e.stableSpeakerId || e.rawSpeaker || "";
        const spk = (t.speakerNames?.[lookupId] || e.speaker || "").trim();
        if (spk) speakerSet.add(spk);
      }
    }
  }

  const avgDuration = totalMeetings > 0 ? totalMinutes / totalMeetings : 0;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const meetingsByWeekday = weekdays.map((day, i) => ({ day, count: weekdayCounts[i] }));
  const meetingsByHour = hourCounts.map((count, hour) => ({ hour, count }));

  const monthKeys = Object.keys(monthlyMeetings).sort();
  const meetingsByMonth = monthKeys.map((month) => ({
    month,
    count: monthlyMeetings[month],
  }));

  return NextResponse.json({
    totalMeetings,
    totalMinutes: Math.round(totalMinutes),
    totalWords,
    totalUsers: uniqueUsers.size,
    totalSpeakers: speakerSet.size,
    avgDuration: Math.round(avgDuration),
    platformBreakdown: Object.entries(platformCounts).map(([platform, count]) => ({ platform, count })),
    durationBuckets,
    meetingsByWeekday,
    meetingsByHour,
    meetingsByMonth,
  });
}

function emptyStats() {
  return {
    totalMeetings: 0,
    totalMinutes: 0,
    totalWords: 0,
    totalUsers: 0,
    totalSpeakers: 0,
    avgDuration: 0,
    platformBreakdown: [],
    durationBuckets: { under5: 0, "5to15": 0, "15to30": 0, "30to60": 0, over60: 0 },
    meetingsByWeekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => ({ day, count: 0 })),
    meetingsByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    meetingsByMonth: [],
  };
}
