"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Users, Leaf, ShieldCheck } from "lucide-react";
import { EmissionsDashboard } from "@/components/admin/EmissionsDashboard";
import { OrgIntelligence } from "@/components/admin/OrgIntelligence";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ITU_COLORS } from "@/lib/theme";
import type { UsageStats } from "@/lib/usageAggregates";

type TeamAnalytics = {
  totalMeetings: number;
  totalMinutes: number;
  totalWords: number;
  totalUsers: number;
  totalSpeakers: number;
  avgDuration: number;
  platformBreakdown: Array<{ platform: string; count: number }>;
  durationBuckets: Record<string, number>;
  meetingsByWeekday: Array<{ day: string; count: number }>;
  meetingsByHour: Array<{ hour: number; count: number }>;
  meetingsByMonth: Array<{ month: string; count: number }>;
};

type Config = {
  rateLimitMinutesPerHour: number;
  rateLimitMinutesPerDay: number;
  monthlyBudgetUsd: number;
  serviceEnabled: boolean;
  adminEmails: string[];
};

type Props = {
  initialStats: UsageStats;
  signedInEmail: string;
};

const PRIMARY = ITU_COLORS.ituBlue;
const SERIES_COLORS = [
  ITU_COLORS.ituBlue,
  ITU_COLORS.darkNavy,
  ITU_COLORS.warning,
  ITU_COLORS.success,
  ITU_COLORS.error,
  ITU_COLORS.midGray,
];
const GRID = ITU_COLORS.borderGray;
const AXIS = ITU_COLORS.midGray;

/**
 * Admin dashboard client shell.
 *
 * Renders four sections:
 *   1. Cost Overview cards + 30-day daily spend bar chart
 *   2. Daily minutes stacked line chart (top 5 users + Others)
 *   3. Sortable, filterable user table
 *   4. Rate-limit editor, CSV download, and service kill-switch
 */
export function AdminDashboardClient({ initialStats, signedInEmail }: Props) {
  const [stats, setStats] = useState<UsageStats>(initialStats);
  const [config, setConfig] = useState<Config | null>(null);
  const [sortKey, setSortKey] = useState<
    "name" | "email" | "totalMinutes" | "totalCost" | "lastUsed" | "sessions"
  >("totalCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configToast, setConfigToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "overview" | "analytics" | "green-ict" | "org-intel"
  >("overview");
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);

  useEffect(() => {
    if (activeTab !== "analytics" || analytics) return;
    fetch("/api/admin/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAnalytics(d); })
      .catch(() => {});
  }, [activeTab, analytics]);

  // Initial + periodic refresh.
  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, cfgRes] = await Promise.all([
          fetch("/api/admin/usage"),
          fetch("/api/admin/config"),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (cfgRes.ok) setConfig(await cfgRes.json());
      } catch {
        /* transient — retry on next interval */
      }
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // ---------- user table ----------
  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = stats.byUser.filter((u) => {
      if (!q) return true;
      return (
        (u.name || "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [stats.byUser, sortKey, sortDir, filter]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  // ---------- chart data ----------
  const last30 = stats.byDay.slice(-30);
  const spendSeries = last30.map((d) => ({
    date: d.date.slice(5), // MM-DD
    cost: Number(d.totalCost.toFixed(3)),
    minutes: Number(d.totalMinutes.toFixed(1)),
  }));

  const stackedSeries = stats.topUsersDaily.days.map((d, i) => {
    const row: Record<string, number | string> = { date: d.slice(5) };
    for (const s of stats.topUsersDaily.series) {
      row[s.label] = Number((s.values[i] ?? 0).toFixed(2));
    }
    return row;
  });

  // ---------- config actions ----------
  const saveConfig = async (patch: Partial<Config>) => {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = (await res.json()) as Config;
        setConfig(updated);
        setConfigToast("Saved.");
        setTimeout(() => setConfigToast(null), 1500);
      } else {
        setConfigToast(`Failed: ${res.status}`);
      }
    } catch (e) {
      setConfigToast((e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  const budgetRemaining = config
    ? Math.max(0, config.monthlyBudgetUsd - stats.currentMonth.cost)
    : 0;
  const today = new Date().toISOString().slice(0, 10);
  const todayRow = stats.byDay.find((d) => d.date === today);

  const tooltipStyle = {
    background: ITU_COLORS.white,
    border: `1px solid ${ITU_COLORS.borderGray}`,
    color: ITU_COLORS.darkNavy,
    fontSize: 12,
  };

  return (
    <main className="min-h-screen bg-off-white pt-3">
      <div className="p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-navy">
            Dhvani admin{" "}
            <span className="text-mid-gray text-sm font-normal">
              · {signedInEmail}
            </span>
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setActiveTab("overview")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === "overview"
                  ? "bg-itu-blue text-white"
                  : "text-mid-gray hover:text-dark-navy hover:bg-light-gray"
              }`}
            >
              <BarChart3 size={12} /> Usage Overview
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === "analytics"
                  ? "bg-itu-blue text-white"
                  : "text-mid-gray hover:text-dark-navy hover:bg-light-gray"
              }`}
            >
              <Users size={12} /> Team Analytics
            </button>
            <button
              onClick={() => setActiveTab("green-ict")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === "green-ict"
                  ? "bg-itu-blue text-white"
                  : "text-mid-gray hover:text-dark-navy hover:bg-light-gray"
              }`}
            >
              <Leaf size={12} /> Green ICT
            </button>
            <button
              onClick={() => setActiveTab("org-intel")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === "org-intel"
                  ? "bg-itu-blue text-white"
                  : "text-mid-gray hover:text-dark-navy hover:bg-light-gray"
              }`}
            >
              <ShieldCheck size={12} /> Org Intelligence
            </button>
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-itu-blue-dark hover:text-itu-blue"
        >
          <ArrowLeft size={14} /> Back to Dhvani
        </Link>
      </header>

      {activeTab === "analytics" && (
        <TeamAnalyticsPanel analytics={analytics} />
      )}

      {activeTab === "green-ict" && <EmissionsDashboard />}

      {activeTab === "org-intel" && <OrgIntelligence />}

      {activeTab === "overview" && (<>
      {/* Overview cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          label="This month"
          primary={`$${stats.currentMonth.cost.toFixed(2)}`}
          secondary={`${(stats.currentMonth.minutes / 60).toFixed(1)} hours · ${
            stats.currentMonth.users
          } users`}
        />
        <Card
          label="Today"
          primary={`$${(todayRow?.totalCost ?? 0).toFixed(2)}`}
          secondary={`${(todayRow?.totalMinutes ?? 0).toFixed(1)} min · ${
            todayRow?.uniqueUsers ?? 0
          } users`}
        />
        <Card
          label="Budget remaining"
          primary={`$${budgetRemaining.toFixed(0)}`}
          secondary={config ? `of $${config.monthlyBudgetUsd} cap` : "—"}
          emphasis={budgetRemaining < 50}
        />
        <Card
          label="All-time"
          primary={`$${stats.totalCost.toFixed(2)}`}
          secondary={`${stats.totalSessions} chunks · ${(
            stats.totalMinutes / 60
          ).toFixed(1)} h`}
        />
      </section>

      {/* Daily cost bar chart */}
      <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
        <h2 className="font-medium mb-3 text-dark-navy">
          Daily cost (last 30 days)
        </h2>
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spendSeries}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="date" stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: ITU_COLORS.midGray }}
                cursor={{ fill: ITU_COLORS.ituBluePale }}
              />
              <Bar dataKey="cost" fill={PRIMARY} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Stacked daily minutes by top user */}
      <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
        <h2 className="font-medium mb-3 text-dark-navy">
          Daily minutes transcribed — top 5 users + others
        </h2>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stackedSeries}>
              <CartesianGrid stroke={GRID} />
              <XAxis dataKey="date" stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: ITU_COLORS.midGray }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {stats.topUsersDaily.series.map((s, i) => (
                <Line
                  key={s.label}
                  type="monotone"
                  dataKey={s.label}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* User table */}
      <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium text-dark-navy">
            Users ({stats.byUser.length})
          </h2>
          <input
            placeholder="Filter by name or email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-border-gray rounded px-3 py-1.5 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-mid-gray text-xs uppercase">
              <tr>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Name</Th>
                <Th onClick={() => toggleSort("email")} active={sortKey === "email"} dir={sortDir}>Email</Th>
                <Th onClick={() => toggleSort("totalMinutes")} active={sortKey === "totalMinutes"} dir={sortDir} right>Minutes</Th>
                <Th onClick={() => toggleSort("totalCost")} active={sortKey === "totalCost"} dir={sortDir} right>Cost</Th>
                <Th onClick={() => toggleSort("sessions")} active={sortKey === "sessions"} dir={sortDir} right>Sessions</Th>
                <Th onClick={() => toggleSort("lastUsed")} active={sortKey === "lastUsed"} dir={sortDir}>Last active</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-gray">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-mid-gray">
                    No users yet.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u, i) => (
                <tr
                  key={u.userId}
                  className={`${i % 2 === 1 ? "bg-off-white" : "bg-white"} hover:bg-itu-blue-pale`}
                >
                  <td className="py-2 pr-3 text-dark-navy">{u.name || "—"}</td>
                  <td className="py-2 pr-3 text-mid-gray">{u.email}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-dark-navy">
                    {u.totalMinutes.toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-dark-navy">
                    ${u.totalCost.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-dark-navy">
                    {u.sessions}
                  </td>
                  <td className="py-2 pr-3 text-mid-gray">
                    {new Date(u.lastUsed).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Controls */}
      <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
        <h2 className="font-medium mb-3 text-dark-navy">Controls</h2>
        {config ? (
          <div className="grid md:grid-cols-2 gap-4">
            <NumberField
              label="Per-user hourly cap (min)"
              value={config.rateLimitMinutesPerHour}
              onCommit={(v) => saveConfig({ rateLimitMinutesPerHour: v })}
              disabled={savingConfig}
            />
            <NumberField
              label="Per-user daily cap (min)"
              value={config.rateLimitMinutesPerDay}
              onCommit={(v) => saveConfig({ rateLimitMinutesPerDay: v })}
              disabled={savingConfig}
            />
            <NumberField
              label="Monthly org budget ($)"
              value={config.monthlyBudgetUsd}
              onCommit={(v) => saveConfig({ monthlyBudgetUsd: v })}
              disabled={savingConfig}
            />
            <div className="flex items-center justify-between bg-off-white border border-border-gray rounded p-3">
              <div>
                <div className="text-sm font-medium text-dark-navy">
                  Service enabled
                </div>
                <div className="text-xs text-mid-gray">
                  Disable to reject all /api/transcribe calls (kill switch).
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  saveConfig({ serviceEnabled: !config.serviceEnabled })
                }
                disabled={savingConfig}
                className={[
                  "px-3 py-1.5 rounded text-sm font-medium",
                  config.serviceEnabled
                    ? "bg-success text-white hover:bg-[#047857]"
                    : "bg-error text-white hover:bg-[#B91C1C]",
                ].join(" ")}
              >
                {config.serviceEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-mid-gray">Loading controls…</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/admin/usage?format=csv"
            className="px-3 py-2 text-sm bg-white border border-border-gray rounded hover:bg-light-gray text-dark-navy"
          >
            Download usage log (CSV)
          </a>
          {configToast && (
            <span className="text-xs text-success self-center">{configToast}</span>
          )}
        </div>
      </section>
      </>)}
      </div>
    </main>
  );
}

function TeamAnalyticsPanel({ analytics }: { analytics: TeamAnalytics | null }) {
  if (!analytics) {
    return <div className="text-sm text-mid-gray py-8 text-center">Loading team analytics...</div>;
  }
  const a = analytics;
  const WEEKDAY_COLORS = ["#94A3B8", "#009CD6", "#009CD6", "#009CD6", "#009CD6", "#009CD6", "#94A3B8"];
  const durationLabels: Record<string, string> = {
    under5: "< 5 min",
    "5to15": "5–15 min",
    "15to30": "15–30 min",
    "30to60": "30–60 min",
    over60: "60+ min",
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card label="Total Meetings" primary={String(a.totalMeetings)} />
        <Card label="Total Minutes" primary={String(a.totalMinutes)} secondary={`${(a.totalMinutes / 60).toFixed(1)} hours`} />
        <Card label="Active Users" primary={String(a.totalUsers)} />
        <Card label="Avg Duration" primary={`${a.avgDuration} min`} />
        <Card label="Total Words" primary={a.totalWords.toLocaleString()} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-dark-navy mb-3">Meetings by Day of Week</h3>
          <div className="flex items-end gap-2 h-32">
            {a.meetingsByWeekday.map((d, i) => {
              const max = Math.max(...a.meetingsByWeekday.map((w) => w.count), 1);
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(d.count / max) * 100}%`,
                      minHeight: d.count > 0 ? 4 : 0,
                      backgroundColor: WEEKDAY_COLORS[i],
                    }}
                  />
                  <span className="text-[10px] text-mid-gray">{d.day}</span>
                  <span className="text-[10px] font-mono text-dark-navy">{d.count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-dark-navy mb-3">Meeting Duration Distribution</h3>
          <div className="space-y-2">
            {Object.entries(a.durationBuckets).map(([key, count]) => {
              const total = a.totalMeetings || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-mid-gray w-20 shrink-0">{durationLabels[key]}</span>
                  <div className="flex-1 h-4 bg-light-gray rounded-full overflow-hidden">
                    <div className="h-full bg-itu-blue rounded-full" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className="text-xs font-mono text-dark-navy w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-dark-navy mb-3">Platform Breakdown</h3>
          {a.platformBreakdown.length === 0 ? (
            <p className="text-xs text-mid-gray">No data yet.</p>
          ) : (
            <div className="space-y-2">
              {a.platformBreakdown.map(({ platform, count }) => {
                const pct = Math.round((count / (a.totalMeetings || 1)) * 100);
                return (
                  <div key={platform} className="flex items-center gap-3">
                    <span className="text-xs text-dark-navy w-24 shrink-0 capitalize">{platform}</span>
                    <div className="flex-1 h-4 bg-light-gray rounded-full overflow-hidden">
                      <div className="h-full bg-itu-blue-dark rounded-full" style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
                    </div>
                    <span className="text-xs font-mono text-dark-navy w-12 text-right">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-dark-navy mb-3">Peak Meeting Hours</h3>
          <div className="flex items-end gap-px h-24">
            {a.meetingsByHour.map((h) => {
              const max = Math.max(...a.meetingsByHour.map((x) => x.count), 1);
              return (
                <div
                  key={h.hour}
                  className="flex-1 bg-itu-blue rounded-t"
                  style={{ height: `${(h.count / max) * 100}%`, minHeight: h.count > 0 ? 2 : 0 }}
                  title={`${h.hour}:00 — ${h.count} meetings`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-mid-gray mt-1">
            <span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
          </div>
        </section>
      </div>

      {a.meetingsByMonth.length > 0 && (
        <section className="bg-white border border-border-gray rounded-lg p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-dark-navy mb-3">Monthly Meeting Trend</h3>
          <div className="flex items-end gap-2 h-32">
            {a.meetingsByMonth.map((m) => {
              const max = Math.max(...a.meetingsByMonth.map((x) => x.count), 1);
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-itu-blue rounded-t"
                    style={{ height: `${(m.count / max) * 100}%`, minHeight: m.count > 0 ? 4 : 0 }}
                  />
                  <span className="text-[9px] text-mid-gray">{m.month.slice(5)}</span>
                  <span className="text-[10px] font-mono text-dark-navy">{m.count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({
  label,
  primary,
  secondary,
  emphasis,
}: {
  label: string;
  primary: string;
  secondary?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-4 shadow-sm",
        emphasis
          ? "border-warning/40 bg-[#FEF3C7]"
          : "border-border-gray bg-white",
      ].join(" ")}
    >
      <div className="text-[10px] uppercase tracking-wider text-mid-gray">
        {label}
      </div>
      <div className="mt-1 text-2xl font-mono font-semibold tabular-nums text-dark-navy">
        {primary}
      </div>
      {secondary && (
        <div className="text-xs text-mid-gray mt-0.5">{secondary}</div>
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  right,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: "asc" | "desc";
  right?: boolean;
}) {
  return (
    <th
      className={`py-2 pr-3 font-normal bg-dark-navy/5 ${right ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`uppercase tracking-wider ${
          active ? "text-itu-blue-dark" : "text-mid-gray hover:text-dark-navy"
        }`}
      >
        {children}
        {active && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function NumberField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const changed = Number(draft) !== value;
  return (
    <div className="bg-off-white border border-border-gray rounded p-3">
      <div className="text-xs text-mid-gray mb-1">{label}</div>
      <div className="flex gap-2">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 bg-white border border-border-gray rounded px-2 py-1 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
          disabled={disabled}
        />
        <button
          type="button"
          disabled={!changed || disabled}
          onClick={() => {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
          }}
          className="px-3 py-1 rounded text-xs bg-itu-blue text-white hover:bg-itu-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}
