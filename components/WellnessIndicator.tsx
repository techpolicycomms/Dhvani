"use client";

import { useEffect, useState } from "react";
import type { WellnessReport } from "@/lib/meetingWellness";

function barColor(signal: number): string {
  if (signal >= 80) return "#10B981";
  if (signal >= 60) return "#F5A623";
  if (signal >= 40) return "#F97316";
  return "#EF4444";
}

/**
 * Compact "signal strength" tile for the home dashboard + /mission.
 * Fetches /api/user/wellness on mount. Silent on failure — wellness
 * is a nice-to-have.
 */
export function WellnessIndicator() {
  const [report, setReport] = useState<WellnessReport | null>(null);
  useEffect(() => {
    fetch("/api/user/wellness", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setReport(body?.wellness ?? null))
      .catch(() => {});
  }, []);

  if (!report) return null;

  const color = barColor(report.signalStrength);
  return (
    <div className="rounded-lg border border-border-gray bg-white p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider">
          Meeting wellness
        </div>
        <div className="text-[11px] text-mid-gray tabular-nums">
          {report.signalStrength}% signal
        </div>
      </div>
      <div className="h-2 bg-light-gray rounded overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${report.signalStrength}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-2 text-xs text-dark-navy">{report.orbitStatus}</div>
      <div className="mt-1 text-[11px] text-mid-gray leading-snug">
        This week: {report.weeklyMeetings} meetings · {report.weeklyHours.toFixed(1)}h
        {report.todayMeetings > 0 && (
          <>
            {" "}· Today: {report.todayMeetings} · {report.todayHours.toFixed(1)}h
          </>
        )}
      </div>
      {report.level !== "healthy" && (
        <div className="mt-2 text-[11px] text-dark-gray leading-snug border-t border-border-gray pt-2">
          {report.recommendation}
        </div>
      )}
    </div>
  );
}
