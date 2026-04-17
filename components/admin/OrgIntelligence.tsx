"use client";

import { useEffect, useState } from "react";
import { Shield, Lightbulb } from "lucide-react";
import type { OrgInsights } from "@/lib/orgIntelligence";

function Card({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-lg border border-border-gray bg-white p-4">
      <div className="text-[10px] uppercase tracking-wider text-mid-gray">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-dark-navy tabular-nums">
        {primary}
      </div>
      {secondary && (
        <div className="mt-1 text-xs text-mid-gray">{secondary}</div>
      )}
    </div>
  );
}

export function OrgIntelligence() {
  const [insights, setInsights] = useState<OrgInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/org-intelligence?period=monthly")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInsights(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-mid-gray">
        Loading anonymised insights…
      </div>
    );
  }
  if (!insights) {
    return (
      <div className="py-10 text-center text-sm text-error">
        Failed to load org intelligence.
      </div>
    );
  }

  const maxDeptMeetings = Math.max(
    ...insights.byDepartment.map((d) => d.meetings),
    1
  );
  const maxAlign = Math.max(
    ...insights.topicAlignment.matrix.flat(),
    1
  );
  const maxWeek = Math.max(...insights.weeklyTrend.map((w) => w.meetings), 1);

  return (
    <div className="space-y-6">
      {/* Privacy banner */}
      <div className="rounded-lg border p-3 flex items-start gap-3" style={{ backgroundColor: "#E8F4FA", borderColor: "#1DA0DB" }}>
        <Shield size={16} className="mt-0.5 text-itu-blue-dark shrink-0" />
        <div className="text-xs text-dark-navy leading-relaxed">
          <div className="font-semibold">All data is anonymised.</div>
          No individual meeting content or participant names are visible. Insights are aggregated across departments with a minimum threshold of{" "}
          <span className="font-semibold">{insights.privacy.kAnonymityThresholdUsers} users</span> and{" "}
          <span className="font-semibold">{insights.privacy.kAnonymityThresholdMeetings} meetings</span>.
          {insights.privacy.suppressedDepartments > 0 && (
            <>
              {" "}
              <span className="italic">
                {insights.privacy.suppressedDepartments} department
                {insights.privacy.suppressedDepartments === 1 ? "" : "s"}
                {" "}below threshold — folded into &quot;Other Departments&quot;.
              </span>
            </>
          )}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Total meetings" primary={`${insights.overview.totalMeetings}`} />
        <Card
          label="Departments active"
          primary={`${insights.overview.totalDepartments}`}
        />
        <Card
          label="Avg duration"
          primary={`${insights.overview.avgDurationMinutes.toFixed(0)} min`}
        />
        <Card label="Contributors" primary={`${insights.privacy.totalContributors}`} />
      </div>

      {/* Top topics */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Most discussed topics
        </div>
        <div className="flex flex-wrap gap-2">
          {insights.overview.topTopics.length === 0 ? (
            <div className="text-xs text-mid-gray">No topics yet — need more contributions.</div>
          ) : (
            insights.overview.topTopics.map((t) => (
              <span
                key={t.keyword}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] bg-itu-blue-pale border border-itu-blue/30 text-itu-blue-dark"
                style={{
                  fontSize: `${10 + Math.min(t.count, 10)}px`,
                }}
              >
                {t.keyword}
                <span className="text-mid-gray">×{t.count}</span>
              </span>
            ))
          )}
        </div>
      </section>

      {/* Topic alignment matrix */}
      <section className="rounded-lg border border-border-gray bg-white p-4 overflow-x-auto">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Topic alignment across departments
        </div>
        {insights.topicAlignment.departments.length === 0 ||
        insights.topicAlignment.topics.length === 0 ? (
          <div className="text-xs text-mid-gray">Not enough data yet.</div>
        ) : (
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="text-left font-medium text-mid-gray pb-2 pr-3">
                  Department
                </th>
                {insights.topicAlignment.topics.map((t) => (
                  <th
                    key={t}
                    className="text-left font-medium text-mid-gray pb-2 pr-3 truncate max-w-[120px]"
                    title={t}
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insights.topicAlignment.departments.map((dept, i) => (
                <tr key={dept} className="border-t border-border-gray">
                  <td className="py-1.5 pr-3 font-medium text-dark-navy truncate max-w-[180px]" title={dept}>
                    {dept}
                  </td>
                  {insights.topicAlignment.matrix[i].map((count, j) => {
                    const intensity = count / maxAlign;
                    return (
                      <td key={j} className="py-1.5 pr-3">
                        <span
                          className="inline-flex items-center justify-center w-7 h-6 rounded text-[10px] tabular-nums"
                          style={{
                            backgroundColor: `rgba(29, 160, 219, ${0.08 + intensity * 0.72})`,
                            color: intensity > 0.5 ? "#fff" : "#003366",
                          }}
                        >
                          {count || ""}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Meeting culture by department */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Meeting culture by department
        </div>
        <div className="space-y-3">
          {insights.byDepartment.map((d) => (
            <div key={d.department} className="text-xs">
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="font-medium text-dark-navy">{d.department}</span>
                <span className="text-mid-gray tabular-nums">
                  {d.meetings} meetings · avg {d.avgDurationMinutes.toFixed(0)} min · {d.avgActionItems.toFixed(1)} action items
                </span>
              </div>
              <div className="h-2 bg-light-gray rounded overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${(d.meetings / maxDeptMeetings) * 100}%`,
                    backgroundColor: "#1DA0DB",
                  }}
                />
              </div>
              {d.topTopics.length > 0 && (
                <div className="mt-1 text-[10px] text-mid-gray">
                  Top topics: {d.topTopics.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Language distribution */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Language distribution
        </div>
        <div className="space-y-2">
          {insights.languageDistribution.map((l) => (
            <div key={l.language} className="text-xs">
              <div className="flex justify-between mb-0.5">
                <span className="text-dark-navy uppercase">{l.language}</span>
                <span className="text-mid-gray tabular-nums">{l.percent}%</span>
              </div>
              <div className="h-1.5 bg-light-gray rounded overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${l.percent}%`,
                    backgroundColor: "#1DA0DB",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly trend */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Weekly meeting volume — last 12 weeks
        </div>
        <div className="flex items-end gap-1.5 h-20">
          {insights.weeklyTrend.map((w) => (
            <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-itu-blue"
                style={{ height: `${(w.meetings / maxWeek) * 100}%` }}
                title={`${w.weekStart}: ${w.meetings}`}
              />
              <div className="text-[8px] text-mid-gray rotate-0">{w.weekStart.slice(5)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Actionable insights */}
      {insights.insights.length > 0 && (
        <section className="rounded-lg border border-border-gray bg-warning/10 p-4">
          <div className="text-sm font-semibold text-dark-navy mb-2 flex items-center gap-2">
            <Lightbulb size={14} className="text-warning" /> Actionable insights
          </div>
          <ul className="space-y-1.5 text-xs text-dark-navy">
            {insights.insights.map((ins, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-warning">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
