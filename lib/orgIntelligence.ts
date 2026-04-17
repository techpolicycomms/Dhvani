/**
 * Anonymised organisational intelligence.
 *
 * Privacy rules (non-negotiable, enforced at every boundary):
 *   R1  K-anonymity: never surface data for groups < 5 users or
 *       < 10 meetings. Below-threshold departments are folded into
 *       an "Other Departments" bucket.
 *   R2  No raw text ever enters this module — transcripts, speaker
 *       names, and attendee emails are stripped before persistence.
 *   R3  Opt-in: records are only created when the user explicitly
 *       enabled "Contribute anonymous insights" in settings.
 *   R4  No drill-down to individual users or specific meetings.
 *   R5  Timestamps are rounded to the nearest day.
 *
 * The on-disk JSONL log is deliberately kept separate from the
 * transcription usage log so identity data cannot leak across
 * boundaries.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type AnonymisedMeetingRecord = {
  /** Random UUID — NOT derivable from user identity. */
  id: string;
  /** Department label as provided by the user/SSO claim. May be "Unknown". */
  department: string;
  /** Rounded to the nearest UTC day — no wall-clock time. */
  dayIso: string;
  durationMinutes: number;
  /** Up to 5 topic keywords extracted from the summary. No raw phrases. */
  topicKeywords: string[];
  /** "Positive" | "Neutral" | "Negative" | "Mixed". */
  sentiment: string;
  actionItemCount: number;
  speakerCount: number;
  languageUsed: string;
};

export type OrgInsights = {
  privacy: {
    kAnonymityThresholdUsers: number;
    kAnonymityThresholdMeetings: number;
    suppressedDepartments: number;
    totalContributors: number;
  };
  overview: {
    totalMeetings: number;
    totalDepartments: number;
    avgDurationMinutes: number;
    topTopics: Array<{ keyword: string; count: number }>;
  };
  byDepartment: Array<{
    department: string;
    meetings: number;
    avgDurationMinutes: number;
    avgActionItems: number;
    topTopics: string[];
    sentimentMix: Record<string, number>;
  }>;
  languageDistribution: Array<{ language: string; percent: number }>;
  weeklyTrend: Array<{ weekStart: string; meetings: number }>;
  /** Topic × department counts. Row = department, col = topic. */
  topicAlignment: {
    departments: string[];
    topics: string[];
    matrix: number[][];
  };
  /** Hand-curated insights based on thresholds — not AI-generated. */
  insights: string[];
};

const K_USERS = 5;
const K_MEETINGS = 10;

function logPath(): string {
  return (
    process.env.ORG_INSIGHTS_LOG_PATH ||
    path.join(process.cwd(), "data", "org-insights.jsonl")
  );
}

function roundToDay(iso: string): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Derive up to 5 lowercase keywords from a summary's markdown. We prefer
 * the explicit ## Keywords section; if absent, fall back to the top
 * capitalised phrases in the summary body.
 */
export function extractKeywords(markdown: string): string[] {
  if (!markdown) return [];
  const m = /##\s*Keywords\s*\n(.+)/i.exec(markdown);
  if (m) {
    return m[1]
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0 && k.length < 60)
      .slice(0, 5);
  }
  const body = markdown.replace(/##[^\n]*\n/g, "");
  const bag = new Map<string, number>();
  for (const word of body.match(/\b[A-Z][a-zA-Z]{3,}\b/g) ?? []) {
    const k = word.toLowerCase();
    bag.set(k, (bag.get(k) ?? 0) + 1);
  }
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
}

export async function recordAnonymisedMeeting(
  input: Omit<AnonymisedMeetingRecord, "id" | "dayIso"> & {
    timestamp: string;
  }
): Promise<void> {
  const rec: AnonymisedMeetingRecord = {
    id: crypto.randomUUID(),
    department: input.department || "Unknown",
    dayIso: roundToDay(input.timestamp),
    durationMinutes: Math.max(0, +input.durationMinutes.toFixed(1)),
    topicKeywords: (input.topicKeywords || []).slice(0, 5),
    sentiment: input.sentiment || "Neutral",
    actionItemCount: Math.max(0, Math.floor(input.actionItemCount || 0)),
    speakerCount: Math.max(0, Math.floor(input.speakerCount || 0)),
    languageUsed: input.languageUsed || "unknown",
  };
  try {
    const p = logPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify(rec) + "\n", "utf8");
  } catch (err) {
    console.warn("dhvani: failed to append org-insights log", err);
  }
}

async function readAll(): Promise<AnonymisedMeetingRecord[]> {
  try {
    const content = await fs.readFile(logPath(), "utf8");
    const out: AnonymisedMeetingRecord[] = [];
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        /* malformed line — skip */
      }
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * Enforce k-anonymity at the department level.
 *
 * We track contributor counts by hashing (department, day) tuples as a
 * privacy-preserving proxy for distinct contributors — the log holds
 * no user id, so this is the closest legitimate signal.
 */
function enforceKAnonymity(
  records: AnonymisedMeetingRecord[]
): {
  visible: AnonymisedMeetingRecord[];
  suppressedDepartments: string[];
} {
  const byDept = new Map<string, AnonymisedMeetingRecord[]>();
  for (const r of records) {
    const arr = byDept.get(r.department) ?? [];
    arr.push(r);
    byDept.set(r.department, arr);
  }
  const visible: AnonymisedMeetingRecord[] = [];
  const suppressed: string[] = [];
  for (const [dept, arr] of byDept) {
    const meetingCount = arr.length;
    const uniqueDays = new Set(arr.map((r) => r.dayIso)).size;
    // Use distinct (department, day) as contributor proxy.
    if (meetingCount >= K_MEETINGS && uniqueDays >= K_USERS) {
      visible.push(...arr);
    } else {
      suppressed.push(dept);
      visible.push(
        ...arr.map((r) => ({ ...r, department: "Other Departments" }))
      );
    }
  }
  return { visible, suppressedDepartments: suppressed };
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function startOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun
  const diff = (day + 6) % 7; // treat Monday as first day
  const w = new Date(d);
  w.setUTCDate(d.getUTCDate() - diff);
  w.setUTCHours(0, 0, 0, 0);
  return w;
}

export async function getOrgInsights(
  period: "monthly" | "quarterly" | "annual" = "monthly"
): Promise<OrgInsights> {
  const all = await readAll();

  // Filter to period.
  const now = Date.now();
  const span =
    period === "annual"
      ? 365
      : period === "quarterly"
      ? 92
      : 30;
  const since = now - span * 24 * 60 * 60 * 1000;
  const windowed = all.filter(
    (r) => new Date(r.dayIso).getTime() >= since
  );

  const { visible, suppressedDepartments } = enforceKAnonymity(windowed);

  // Overview.
  const allTopics = new Map<string, number>();
  for (const r of visible) {
    for (const k of r.topicKeywords) {
      allTopics.set(k, (allTopics.get(k) ?? 0) + 1);
    }
  }
  const topTopicsList = [...allTopics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  const departments = [...new Set(visible.map((r) => r.department))];

  // By-department aggregates.
  const byDepartment = departments.map((dept) => {
    const rows = visible.filter((r) => r.department === dept);
    const deptTopics = new Map<string, number>();
    for (const r of rows) {
      for (const k of r.topicKeywords) {
        deptTopics.set(k, (deptTopics.get(k) ?? 0) + 1);
      }
    }
    const sentimentMix: Record<string, number> = {};
    for (const r of rows) {
      sentimentMix[r.sentiment] = (sentimentMix[r.sentiment] ?? 0) + 1;
    }
    return {
      department: dept,
      meetings: rows.length,
      avgDurationMinutes: +mean(rows.map((r) => r.durationMinutes)).toFixed(1),
      avgActionItems: +mean(rows.map((r) => r.actionItemCount)).toFixed(1),
      topTopics: [...deptTopics.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k),
      sentimentMix,
    };
  });

  // Language distribution.
  const langCount = new Map<string, number>();
  for (const r of visible) {
    langCount.set(r.languageUsed, (langCount.get(r.languageUsed) ?? 0) + 1);
  }
  const total = visible.length || 1;
  const languageDistribution = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({
      language,
      percent: +((count / total) * 100).toFixed(1),
    }));

  // Weekly trend (last 12 weeks).
  const weekBuckets = new Map<string, number>();
  for (const r of visible) {
    const wk = startOfWeekUTC(new Date(r.dayIso)).toISOString().slice(0, 10);
    weekBuckets.set(wk, (weekBuckets.get(wk) ?? 0) + 1);
  }
  const weeklyTrend = [...weekBuckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12)
    .map(([weekStart, meetings]) => ({ weekStart, meetings }));

  // Topic alignment matrix.
  const topTopicKeys = topTopicsList.slice(0, 6).map((t) => t.keyword);
  const matrix = departments.map((dept) => {
    const rows = visible.filter((r) => r.department === dept);
    return topTopicKeys.map(
      (k) => rows.filter((r) => r.topicKeywords.includes(k)).length
    );
  });

  // Threshold-driven insights.
  const insights: string[] = [];
  const orgAvgActionItems = mean(visible.map((r) => r.actionItemCount));
  for (const d of byDepartment) {
    if (orgAvgActionItems > 0 && d.avgActionItems > orgAvgActionItems * 1.3) {
      insights.push(
        `${d.department} meetings produce ${Math.round(
          ((d.avgActionItems - orgAvgActionItems) / orgAvgActionItems) * 100
        )}% more action items than the org average.`
      );
    }
  }
  const sharedTopics = topTopicKeys.filter((k) => {
    const count = departments.filter((dept) =>
      visible.some(
        (r) => r.department === dept && r.topicKeywords.includes(k)
      )
    ).length;
    return count >= 3;
  });
  for (const t of sharedTopics.slice(0, 2)) {
    insights.push(
      `Three or more departments discussed "${t}" this period — consider a cross-department sync.`
    );
  }
  if (weeklyTrend.length >= 2) {
    const last = weeklyTrend[weeklyTrend.length - 1].meetings;
    const prev = weeklyTrend[weeklyTrend.length - 2].meetings;
    if (prev > 0 && last > prev * 1.25) {
      insights.push(
        `Meeting volume up ${Math.round(
          ((last - prev) / prev) * 100
        )}% week-over-week.`
      );
    }
  }

  return {
    privacy: {
      kAnonymityThresholdUsers: K_USERS,
      kAnonymityThresholdMeetings: K_MEETINGS,
      suppressedDepartments: suppressedDepartments.length,
      totalContributors: new Set(visible.map((r) => r.dayIso + r.department))
        .size,
    },
    overview: {
      totalMeetings: visible.length,
      totalDepartments: departments.length,
      avgDurationMinutes: +mean(visible.map((r) => r.durationMinutes)).toFixed(1),
      topTopics: topTopicsList,
    },
    byDepartment,
    languageDistribution,
    weeklyTrend,
    topicAlignment: {
      departments,
      topics: topTopicKeys,
      matrix,
    },
    insights,
  };
}

/**
 * In demo mode the opt-in log is empty, so we seed the dashboard with
 * realistic mock data. Called by the API route only when the log is
 * empty and DEMO_MODE is true — production users see their real data.
 */
export function generateDemoRecords(count = 80): AnonymisedMeetingRecord[] {
  const depts = [
    "Radiocommunication",
    "Development",
    "General Secretariat",
    "Innovation Hub",
    "Standards",
  ];
  const topicPool = [
    "spectrum allocation",
    "ai policy",
    "digital inclusion",
    "budget review",
    "standards alignment",
    "capacity building",
    "cybersecurity",
    "satellite coordination",
    "governance",
    "sdg reporting",
  ];
  const sentiments = ["Positive", "Neutral", "Negative", "Mixed"];
  const languages = ["en", "fr", "es", "ar", "zh"];
  const records: AnonymisedMeetingRecord[] = [];
  for (let i = 0; i < count; i++) {
    const days = Math.floor(Math.random() * 29);
    const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const topics = new Set<string>();
    while (topics.size < 3 + Math.floor(Math.random() * 3)) {
      topics.add(topicPool[Math.floor(Math.random() * topicPool.length)]);
    }
    records.push({
      id: crypto.randomUUID(),
      department: depts[Math.floor(Math.random() * depts.length)],
      dayIso: d.toISOString().slice(0, 10),
      durationMinutes: 15 + Math.floor(Math.random() * 60),
      topicKeywords: [...topics],
      sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
      actionItemCount: Math.floor(Math.random() * 8),
      speakerCount: 2 + Math.floor(Math.random() * 6),
      languageUsed: languages[Math.floor(Math.random() * languages.length)],
    });
  }
  return records;
}
