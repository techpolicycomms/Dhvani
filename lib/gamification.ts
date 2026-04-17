/**
 * Gamification engine — space + ICT themed. Every meeting is a
 * satellite deployed; every completed action item is a frequency
 * coordinated. Stats are computed from the existing usage log +
 * task log on demand (no new persistence layer to maintain).
 */

export type Rank = {
  id: string;
  title: string;
  icon: string;
  minXp: number;
  description: string;
};

export const RANKS: Rank[] = [
  { id: "intern", title: "Ground Station Intern", icon: "📡", minXp: 0, description: "Just tuning in to the frequency" },
  { id: "technician", title: "Signal Technician", icon: "🔧", minXp: 100, description: "Learning to decode the transmissions" },
  { id: "operator", title: "Spectrum Operator", icon: "🎛️", minXp: 300, description: "Licensed to monitor the bands" },
  { id: "engineer", title: "Orbit Engineer", icon: "🛰️", minXp: 600, description: "Deploying satellites with confidence" },
  { id: "coordinator", title: "Frequency Coordinator", icon: "📊", minXp: 1000, description: "Managing the spectrum like a pro" },
  { id: "architect", title: "Constellation Architect", icon: "🌐", minXp: 1800, description: "Designing orbital patterns of productivity" },
  { id: "director", title: "Mission Director", icon: "🚀", minXp: 3000, description: "Leading launches across all bands" },
  { id: "chief", title: "Chief Spectrum Officer", icon: "⭐", minXp: 5000, description: "Master of all frequencies and orbits" },
  { id: "legend", title: "ITU Legend", icon: "🌟", minXp: 10000, description: "Your constellation spans the globe" },
];

export type Badge = {
  id: string;
  name: string;
  icon: string;
  description: string;
};

export const BADGES: Badge[] = [
  { id: "first-signal", name: "First Signal", icon: "📡", description: "Transcribed your first meeting" },
  { id: "five-launches", name: "Five Launches", icon: "🚀", description: "Transcribed 5 meetings" },
  { id: "constellation-builder", name: "Constellation Builder", icon: "🛰️", description: "Transcribed 25 meetings" },
  { id: "mega-constellation", name: "Mega-Constellation", icon: "🌐", description: "Transcribed 100 meetings — Starlink who?" },
  { id: "first-coordination", name: "First Coordination", icon: "📋", description: "Completed your first action item" },
  { id: "interference-free", name: "Interference-Free Zone", icon: "✅", description: "Completed 10 action items — no harmful interference!" },
  { id: "clean-spectrum", name: "Clean Spectrum", icon: "🏆", description: "Completed 50 action items" },
  { id: "daily-check-in", name: "Daily Check-In", icon: "📅", description: "3-day streak of using Dhvani" },
  { id: "weekly-orbit", name: "Stable Orbit", icon: "🔄", description: "5-day streak — you are in stable orbit" },
  { id: "monthly-mission", name: "Mission Endurance", icon: "🛸", description: "20-day streak — long-duration mission" },
  { id: "multilingual-signal", name: "Multilingual Signal", icon: "🌍", description: "Transcribed in 3+ languages" },
  { id: "polyglot-operator", name: "Polyglot Operator", icon: "🗣️", description: "Transcribed in all 6 UN languages" },
  { id: "balanced-orbit", name: "Balanced Orbit", icon: "⚖️", description: "Kept meetings under 4 hours this week" },
  { id: "first-summary", name: "First Debrief", icon: "📝", description: "Generated your first AI summary" },
  { id: "summary-champion", name: "Mission Debrief Expert", icon: "🎖️", description: "Generated 25 summaries" },
  { id: "green-operator", name: "Green Operator", icon: "🌱", description: "Your monthly carbon footprint is under 50g CO₂" },
];

export type MissionStats = {
  totalMeetingsTranscribed: number;
  totalMinutesTranscribed: number;
  totalActionItemsCreated: number;
  totalActionItemsCompleted: number;
  totalSummariesGenerated: number;
  streakDays: number;
  currentWeekMeetings: number;
  currentWeekMinutes: number;
  uniqueLanguages: number;
  monthlyCarbonGrams: number;
  xp: number;
  level: number;
  rank: Rank;
  nextRank: Rank | null;
  nextLevelXp: number;
  earnedBadges: Array<Badge & { earnedDate: string }>;
};

export function xpFor(input: {
  totalMeetingsTranscribed: number;
  totalActionItemsCompleted: number;
  totalSummariesGenerated: number;
  streakDays: number;
  totalMinutesTranscribed: number;
}): number {
  return (
    input.totalMeetingsTranscribed * 10 +
    input.totalActionItemsCompleted * 5 +
    input.totalSummariesGenerated * 3 +
    input.streakDays * 2 +
    Math.floor(input.totalMinutesTranscribed / 10)
  );
}

export function rankFor(xp: number): { rank: Rank; nextRank: Rank | null } {
  let rank = RANKS[0];
  let nextRank: Rank | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].minXp) rank = RANKS[i];
    else {
      nextRank = RANKS[i];
      break;
    }
  }
  return { rank, nextRank };
}

export function levelFor(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

/**
 * Evaluate which badges are earned given the rollup stats.
 * `earnedDate` is "now" since we don't keep a durable earn log —
 * a future revision can persist badge-earn events if we want a
 * real "newly earned" toast.
 */
export function evaluateBadges(
  stats: Omit<MissionStats, "rank" | "nextRank" | "level" | "xp" | "nextLevelXp" | "earnedBadges">
): Array<Badge & { earnedDate: string }> {
  const now = new Date().toISOString();
  const earned = new Set<string>();
  if (stats.totalMeetingsTranscribed >= 1) earned.add("first-signal");
  if (stats.totalMeetingsTranscribed >= 5) earned.add("five-launches");
  if (stats.totalMeetingsTranscribed >= 25) earned.add("constellation-builder");
  if (stats.totalMeetingsTranscribed >= 100) earned.add("mega-constellation");
  if (stats.totalActionItemsCompleted >= 1) earned.add("first-coordination");
  if (stats.totalActionItemsCompleted >= 10) earned.add("interference-free");
  if (stats.totalActionItemsCompleted >= 50) earned.add("clean-spectrum");
  if (stats.streakDays >= 3) earned.add("daily-check-in");
  if (stats.streakDays >= 5) earned.add("weekly-orbit");
  if (stats.streakDays >= 20) earned.add("monthly-mission");
  if (stats.uniqueLanguages >= 3) earned.add("multilingual-signal");
  if (stats.uniqueLanguages >= 6) earned.add("polyglot-operator");
  if (stats.currentWeekMinutes <= 240 && stats.currentWeekMeetings > 0) earned.add("balanced-orbit");
  if (stats.totalSummariesGenerated >= 1) earned.add("first-summary");
  if (stats.totalSummariesGenerated >= 25) earned.add("summary-champion");
  if (stats.monthlyCarbonGrams > 0 && stats.monthlyCarbonGrams < 50) earned.add("green-operator");
  return BADGES.filter((b) => earned.has(b.id)).map((b) => ({ ...b, earnedDate: now }));
}

/**
 * Build a full MissionStats from raw usage + task rollups. All
 * counts except monthlyCarbonGrams + summaries come from the usage
 * log; summary count is the chat-usage log; carbon is a rough
 * estimate using the emissions engine.
 */
export function buildMissionStats(inputs: {
  totalMeetingsTranscribed: number;
  totalMinutesTranscribed: number;
  totalActionItemsCreated: number;
  totalActionItemsCompleted: number;
  totalSummariesGenerated: number;
  streakDays: number;
  currentWeekMeetings: number;
  currentWeekMinutes: number;
  uniqueLanguages: number;
  monthlyCarbonGrams: number;
}): MissionStats {
  const xp = xpFor(inputs);
  const { rank, nextRank } = rankFor(xp);
  const level = levelFor(xp);
  const nextLevelXp = level * 100;
  const earnedBadges = evaluateBadges(inputs);
  return { ...inputs, xp, level, rank, nextRank, nextLevelXp, earnedBadges };
}
