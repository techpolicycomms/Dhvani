import { readAllUsage, type UsageRecord } from "./usageLogger";

/**
 * Pre-computed shape returned by /api/admin/usage and consumed by the
 * admin dashboard. Pure function of the usage log — no mutable state.
 */
export type UsageStats = {
  totalCost: number;
  totalMinutes: number;
  totalSessions: number;
  byUser: Array<{
    userId: string;
    email: string;
    name: string | null;
    totalMinutes: number;
    totalCost: number;
    lastUsed: string;
    sessions: number;
  }>;
  byDay: Array<{
    date: string; // YYYY-MM-DD
    totalMinutes: number;
    totalCost: number;
    uniqueUsers: number;
  }>;
  currentMonth: {
    cost: number;
    minutes: number;
    users: number;
  };
  // Per-user, per-day minutes for the stacked-area chart (last 30 days,
  // top 5 users by spend + "others").
  topUsersDaily: {
    days: string[];
    series: Array<{ label: string; values: number[] }>;
  };
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function monthStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

/**
 * Aggregate the raw usage log into dashboard-ready shape.
 *
 * A "session" is approximated as one log record (≈ one Whisper chunk).
 * For a sharper definition we'd need a session start/end marker — left
 * as a TODO once we introduce a database.
 */
export function aggregate(records: UsageRecord[]): UsageStats {
  let totalCost = 0;
  let totalMinutes = 0;

  const byUserMap = new Map<
    string,
    {
      userId: string;
      email: string;
      name: string | null;
      totalMinutes: number;
      totalCost: number;
      lastUsed: string;
      sessions: number;
    }
  >();

  const byDayMap = new Map<
    string,
    { date: string; totalMinutes: number; totalCost: number; users: Set<string> }
  >();

  const monthStartMs = monthStart();
  let monthCost = 0;
  let monthMinutes = 0;
  const monthUsers = new Set<string>();

  for (const r of records) {
    const minutes = r.audioDurationSeconds / 60;
    totalCost += r.whisperCost;
    totalMinutes += minutes;

    const u = byUserMap.get(r.userId) || {
      userId: r.userId,
      email: r.email,
      name: r.name,
      totalMinutes: 0,
      totalCost: 0,
      lastUsed: r.timestamp,
      sessions: 0,
    };
    u.totalMinutes += minutes;
    u.totalCost += r.whisperCost;
    u.sessions += 1;
    if (r.timestamp > u.lastUsed) u.lastUsed = r.timestamp;
    if (!u.name && r.name) u.name = r.name;
    byUserMap.set(r.userId, u);

    const dk = dayKey(r.timestamp);
    const d = byDayMap.get(dk) || {
      date: dk,
      totalMinutes: 0,
      totalCost: 0,
      users: new Set<string>(),
    };
    d.totalMinutes += minutes;
    d.totalCost += r.whisperCost;
    d.users.add(r.userId);
    byDayMap.set(dk, d);

    if (new Date(r.timestamp).getTime() >= monthStartMs) {
      monthCost += r.whisperCost;
      monthMinutes += minutes;
      monthUsers.add(r.userId);
    }
  }

  const byUser = [...byUserMap.values()].sort((a, b) => b.totalCost - a.totalCost);
  const byDay = [...byDayMap.values()]
    .map((d) => ({
      date: d.date,
      totalMinutes: d.totalMinutes,
      totalCost: d.totalCost,
      uniqueUsers: d.users.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top users daily series — last 30 days, top 5 users by spend.
  const days = last30Days();
  const top = byUser.slice(0, 5).map((u) => u);
  const othersIds = new Set(byUser.slice(5).map((u) => u.userId));
  const topIds = new Set(top.map((u) => u.userId));

  const minutesByUserDay = new Map<string, Map<string, number>>();
  for (const r of records) {
    const dk = dayKey(r.timestamp);
    const bucket = topIds.has(r.userId)
      ? r.userId
      : othersIds.has(r.userId)
      ? "__others__"
      : r.userId;
    const key = `${bucket}|${dk}`;
    const map = minutesByUserDay.get(bucket) || new Map<string, number>();
    map.set(dk, (map.get(dk) || 0) + r.audioDurationSeconds / 60);
    minutesByUserDay.set(bucket, map);
  }

  const series: Array<{ label: string; values: number[] }> = top.map((u) => ({
    label: u.name || u.email,
    values: days.map((d) => minutesByUserDay.get(u.userId)?.get(d) ?? 0),
  }));
  if (othersIds.size > 0) {
    const map = minutesByUserDay.get("__others__");
    series.push({
      label: "Others",
      values: days.map((d) => map?.get(d) ?? 0),
    });
  }

  return {
    totalCost,
    totalMinutes,
    totalSessions: records.length,
    byUser,
    byDay,
    currentMonth: {
      cost: monthCost,
      minutes: monthMinutes,
      users: monthUsers.size,
    },
    topUsersDaily: { days, series },
  };
}

function last30Days(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const x = new Date(d.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

export async function loadStats(): Promise<UsageStats> {
  return aggregate(await readAllUsage());
}

export function toCsv(records: UsageRecord[]): string {
  const header = "timestamp,userId,email,name,audioDurationSeconds,whisperCost,chunkId\n";
  const rows = records
    .map((r) =>
      [
        r.timestamp,
        r.userId,
        r.email,
        (r.name || "").replaceAll(",", " "),
        r.audioDurationSeconds.toFixed(3),
        r.whisperCost.toFixed(6),
        r.chunkId,
      ].join(",")
    )
    .join("\n");
  return header + rows + "\n";
}
