"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import type { UsageStats } from "@/lib/usageAggregates";

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

const TEAL = "#14b8a6";
const SERIES_COLORS = ["#14b8a6", "#6366f1", "#f59e0b", "#ec4899", "#10b981", "#94a3b8"];

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

  return (
    <main className="min-h-screen p-4 sm:p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Dhvani admin{" "}
            <span className="text-white/50 text-sm font-normal">
              · {signedInEmail}
            </span>
          </h1>
          <p className="text-xs text-white/50 mt-1">
            Live usage and controls. Stats refresh every 30 s.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-teal hover:text-teal-dark"
        >
          ← Back to Dhvani
        </Link>
      </header>

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
      <section className="bg-navy-light/40 border border-white/10 rounded-lg p-4">
        <h2 className="font-medium mb-3">Daily cost (last 30 days)</h2>
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={spendSeries}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Bar dataKey="cost" fill={TEAL} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Stacked daily minutes by top user */}
      <section className="bg-navy-light/40 border border-white/10 rounded-lg p-4">
        <h2 className="font-medium mb-3">
          Daily minutes transcribed — top 5 users + others
        </h2>
        <div className="w-full h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stackedSeries}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                }}
                labelStyle={{ color: "#94a3b8" }}
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
      <section className="bg-navy-light/40 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-medium">Users ({stats.byUser.length})</h2>
          <input
            placeholder="Filter by name or email…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-navy border border-white/10 rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-white/50 text-xs uppercase">
              <tr>
                <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Name</Th>
                <Th onClick={() => toggleSort("email")} active={sortKey === "email"} dir={sortDir}>Email</Th>
                <Th onClick={() => toggleSort("totalMinutes")} active={sortKey === "totalMinutes"} dir={sortDir} right>Minutes</Th>
                <Th onClick={() => toggleSort("totalCost")} active={sortKey === "totalCost"} dir={sortDir} right>Cost</Th>
                <Th onClick={() => toggleSort("sessions")} active={sortKey === "sessions"} dir={sortDir} right>Sessions</Th>
                <Th onClick={() => toggleSort("lastUsed")} active={sortKey === "lastUsed"} dir={sortDir}>Last active</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-white/40">
                    No users yet.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => (
                <tr key={u.userId} className="hover:bg-white/5">
                  <td className="py-2 pr-3">{u.name || "—"}</td>
                  <td className="py-2 pr-3 text-white/70">{u.email}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {u.totalMinutes.toFixed(1)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    ${u.totalCost.toFixed(3)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {u.sessions}
                  </td>
                  <td className="py-2 pr-3 text-white/60">
                    {new Date(u.lastUsed).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Controls */}
      <section className="bg-navy-light/40 border border-white/10 rounded-lg p-4">
        <h2 className="font-medium mb-3">Controls</h2>
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
            <div className="flex items-center justify-between bg-navy/40 border border-white/10 rounded p-3">
              <div>
                <div className="text-sm font-medium">Service enabled</div>
                <div className="text-xs text-white/50">
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
                    ? "bg-teal text-navy hover:bg-teal-dark"
                    : "bg-red-500 text-white hover:bg-red-600",
                ].join(" ")}
              >
                {config.serviceEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/50">Loading controls…</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/admin/usage?format=csv"
            className="px-3 py-2 text-sm bg-navy border border-white/10 rounded hover:bg-navy-light text-white/90"
          >
            Download usage log (CSV)
          </a>
          {configToast && (
            <span className="text-xs text-teal self-center">{configToast}</span>
          )}
        </div>
      </section>
    </main>
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
        "rounded-lg border p-4",
        emphasis
          ? "border-yellow-400/40 bg-yellow-400/5"
          : "border-white/10 bg-navy-light/40",
      ].join(" ")}
    >
      <div className="text-[10px] uppercase tracking-wider text-white/50">
        {label}
      </div>
      <div className="mt-1 text-2xl font-mono font-semibold tabular-nums">
        {primary}
      </div>
      {secondary && (
        <div className="text-xs text-white/50 mt-0.5">{secondary}</div>
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
    <th className={`py-2 pr-3 font-normal ${right ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`uppercase tracking-wider ${active ? "text-teal" : "text-white/50 hover:text-white"}`}
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
    <div className="bg-navy/40 border border-white/10 rounded p-3">
      <div className="text-xs text-white/60 mb-1">{label}</div>
      <div className="flex gap-2">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 bg-navy border border-white/10 rounded px-2 py-1 text-sm"
          disabled={disabled}
        />
        <button
          type="button"
          disabled={!changed || disabled}
          onClick={() => {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
          }}
          className="px-3 py-1 rounded text-xs bg-teal text-navy hover:bg-teal-dark disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
        </button>
      </div>
    </div>
  );
}
