"use client";

import { useEffect, useState } from "react";
import { BADGES, type MissionStats } from "@/lib/gamification";
import { WellnessIndicator } from "@/components/WellnessIndicator";

/**
 * Mission Control — the gamified stats dashboard.
 *
 * Minimal-functional version: rank header, XP progress, 4 stat
 * cards, badge grid with earned/locked states, wellness indicator.
 * No SVG constellation map in v1 (tracked as scope note in commit).
 */
export function MissionControl() {
  const [stats, setStats] = useState<MissionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setStats(body?.stats ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-mid-gray">
        Loading mission stats…
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="py-10 text-center text-sm text-error">
        Could not load stats.
      </div>
    );
  }

  const xpIntoNextLevel = stats.xp % 100;
  const pctToNextLevel = xpIntoNextLevel;
  const earnedIds = new Set(stats.earnedBadges.map((b) => b.id));

  return (
    <div className="space-y-6">
      {/* Rank header */}
      <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,#0B1426 0%,#1A2744 100%)" }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="text-4xl">{stats.rank.icon}</div>
            <div>
              <div className="text-xs uppercase tracking-wider text-white/60">
                Rank
              </div>
              <div className="text-xl font-bold">
                {stats.rank.title} · Level {stats.level}
              </div>
              <div className="text-xs text-white/70 mt-0.5">
                {stats.rank.description}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-white/60">
              Streak
            </div>
            <div className="text-xl font-bold">🔥 {stats.streakDays} day{stats.streakDays === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[11px] text-white/60 mb-1 tabular-nums">
            {stats.xp} XP
            {stats.nextRank ? ` · ${stats.nextRank.minXp - stats.xp} XP to ${stats.nextRank.title}` : " · Max rank"}
          </div>
          <div className="h-2 bg-white/15 rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{ width: `${pctToNextLevel}%`, background: "linear-gradient(90deg,#009CD6,#10B981)" }}
            />
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon="🛰️"
          label="Satellites Deployed"
          value={String(stats.totalMeetingsTranscribed)}
          sub={`${stats.currentWeekMeetings} this week`}
        />
        <StatCard
          icon="📡"
          label="Frequencies Coordinated"
          value={`${stats.totalActionItemsCompleted}/${stats.totalActionItemsCreated}`}
          sub={
            stats.totalActionItemsCreated > 0
              ? `${Math.round((stats.totalActionItemsCompleted / stats.totalActionItemsCreated) * 100)}% complete`
              : "No tasks yet"
          }
        />
        <StatCard
          icon="⏱️"
          label="Mission Time"
          value={formatDuration(stats.totalMinutesTranscribed)}
          sub={`across ${stats.totalMeetingsTranscribed} mission${stats.totalMeetingsTranscribed === 1 ? "" : "s"}`}
        />
        <StatCard
          icon="📊"
          label="Debrief Rate"
          value={
            stats.totalMeetingsTranscribed > 0
              ? `${Math.round((stats.totalSummariesGenerated / stats.totalMeetingsTranscribed) * 100)}%`
              : "—"
          }
          sub="of meetings have summaries"
        />
      </div>

      {/* Wellness */}
      <WellnessIndicator />

      {/* Badges */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-sm font-semibold text-dark-navy">Badges</div>
          <div className="text-[11px] text-mid-gray">
            {stats.earnedBadges.length} of {BADGES.length} earned
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {BADGES.map((b) => {
            const earned = earnedIds.has(b.id);
            return (
              <div
                key={b.id}
                className={[
                  "rounded-lg border p-3 text-center transition-opacity",
                  earned
                    ? "border-itu-blue bg-itu-blue-pale"
                    : "border-border-gray bg-off-white opacity-50",
                ].join(" ")}
                title={b.description}
              >
                <div className="text-2xl">{b.icon}</div>
                <div className="text-[11px] font-semibold text-dark-navy mt-1">
                  {b.name}
                </div>
                <div className="text-[10px] text-mid-gray mt-0.5 leading-snug">
                  {b.description}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border-gray bg-white p-4">
      <div className="text-2xl">{icon}</div>
      <div className="text-[10px] uppercase tracking-wider text-mid-gray mt-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-dark-navy tabular-nums mt-0.5">
        {value}
      </div>
      {sub && <div className="text-[11px] text-mid-gray mt-0.5">{sub}</div>}
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
