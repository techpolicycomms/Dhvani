"use client";

import { useEffect, useState } from "react";
import { Leaf, Zap, TreePine, Search, Mail, Video, Car, Plane, Download } from "lucide-react";
import type { EmissionsReport } from "@/lib/greenIct";

function Card({
  label,
  primary,
  secondary,
  badge,
  badgeColor,
}: {
  label: string;
  primary: string;
  secondary?: string;
  badge?: string;
  badgeColor?: string;
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
      {badge && (
        <span
          className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: (badgeColor || "#059669") + "20",
            color: badgeColor || "#059669",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  color = "#009CD6",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="text-xs">
      <div className="flex justify-between text-mid-gray mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(2)} g</span>
      </div>
      <div className="h-2 bg-light-gray rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function downloadReport(report: EmissionsReport) {
  const lines = [
    "# Dhvani Emissions Report",
    "",
    `Period: ${report.period.from.slice(0, 10)} → ${report.period.to.slice(0, 10)} (${report.period.label})`,
    "",
    "## Governance",
    "Dhvani is governed by the ITU Innovation Hub. Climate-related disclosures",
    "follow IPSASB SRS 1 (effective January 2026) with GHG Protocol and IFRS S2",
    "alignment for cross-sector comparability.",
    "",
    "## Strategy",
    "Dhvani shifts meeting transcription from on-premise hardware and manual note-taking",
    "to shared cloud AI. Climate impact is dominated by Azure OpenAI inference electricity.",
    "",
    "## Risk Management",
    "Grid carbon intensity is sourced at point-of-use; deployment to low-carbon regions",
    "(Sweden Central: 8 gCO2/kWh) materially reduces Scope 2 footprint vs. default grid.",
    "",
    "## Metrics & Targets",
    "",
    `- Total Scope 2: ${report.scope2.carbonGrams.toFixed(2)} g CO2e (${report.scope2.totalEnergykWh.toFixed(4)} kWh)`,
    `- Total Scope 3 (embodied, estimated): ${report.scope3.estimatedCarbonGrams.toFixed(2)} g CO2e`,
    `- Total emissions: ${report.totalCarbonGrams.toFixed(2)} g CO2e (${report.totalCarbonKg.toFixed(4)} kg)`,
    `- Grid region: ${report.scope2.gridRegion} (${report.scope2.gridIntensity} gCO2/kWh)`,
    `- Transcription calls: ${report.scope2.byModel.transcription.calls}`,
    `- Chat calls: ${report.scope2.byModel.chat.calls}`,
    "",
    "## Equivalences",
    `- ${report.equivalences.googleSearches.toLocaleString()} Google searches`,
    `- ${report.equivalences.emailsSent.toLocaleString()} emails sent`,
    `- ${report.equivalences.videoCallMinutes} minutes of video call`,
    `- ${report.equivalences.carKm} km driving`,
    `- ${report.equivalences.flightKm} km flying`,
    `- ${report.equivalences.treeDaysToOffset} tree-days to offset`,
    "",
    "## Methodology",
    report.disclosureNotes.methodology,
    "",
    "## Limitations",
    report.disclosureNotes.limitations,
    "",
    "## Standard",
    report.disclosureNotes.standard,
    "",
    "## Sources",
    ...report.disclosureNotes.sources.map((s) => `- ${s}`),
    "",
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dhvani-emissions-${report.period.label}-${report.period.from.slice(0, 7)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function EmissionsDashboard() {
  const [report, setReport] = useState<EmissionsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/emissions?period=monthly")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setReport(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-mid-gray">
        Loading emissions report…
      </div>
    );
  }
  if (!report) {
    return (
      <div className="py-10 text-center text-sm text-error">
        Failed to load emissions data.
      </div>
    );
  }

  const cleanGrid = report.scope2.gridIntensity < 100;
  const maxActivity = Math.max(
    ...report.byActivity.map((a) => a.carbonGrams),
    1
  );
  const maxTrend = Math.max(...report.trend.map((t) => t.totalGrams), 1);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-dark-navy flex items-center gap-2">
          <Leaf size={18} className="text-success" /> AI Carbon Footprint
        </h2>
        <p className="text-xs text-mid-gray mt-1">
          Aligned with IPSASB SRS 1 (Jan 2026), GHG Protocol, and IFRS S2.
        </p>
      </div>

      {/* ROW 1 — Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card
          label="Total Carbon This Period"
          primary={`${report.totalCarbonKg.toFixed(4)} kg CO₂e`}
          secondary={`Scope 2: ${report.scope2.carbonGrams.toFixed(2)} g · Scope 3: ${report.scope3.estimatedCarbonGrams.toFixed(2)} g`}
          badge={cleanGrid ? "Low-carbon grid" : undefined}
          badgeColor="#059669"
        />
        <Card
          label="Energy Consumed"
          primary={`${report.scope2.totalEnergykWh.toFixed(4)} kWh`}
          secondary={`${report.scope2.totalEnergyWh.toFixed(1)} Wh from ${
            report.scope2.byModel.transcription.calls +
            report.scope2.byModel.chat.calls
          } AI calls`}
        />
        <Card
          label="Grid Carbon Intensity"
          primary={`${report.scope2.gridIntensity} gCO₂/kWh`}
          secondary={`Region: ${report.scope2.gridRegion}`}
          badge={cleanGrid ? "Clean Grid ✓" : "Standard Grid"}
          badgeColor={cleanGrid ? "#059669" : "#D97706"}
        />
      </div>

      {/* ROW 2 — Scope breakdown */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Scope Breakdown (GHG Protocol)
        </div>
        <div className="space-y-3">
          <Bar
            label="Scope 2 — Purchased electricity (inference)"
            value={report.scope2.carbonGrams}
            max={report.totalCarbonGrams}
            color="#009CD6"
          />
          <Bar
            label="Scope 3 — Embodied (GPU + data-centre, estimated)"
            value={report.scope3.estimatedCarbonGrams}
            max={report.totalCarbonGrams}
            color="#7C3AED"
          />
          <div className="text-[11px] text-mid-gray pt-1">
            Scope 1 is zero — Dhvani operates no on-premise infrastructure.
          </div>
        </div>
      </section>

      {/* ROW 3 — Equivalences */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          This period&apos;s AI usage is equivalent to:
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <Equiv
            icon={<Search size={14} />}
            value={report.equivalences.googleSearches.toLocaleString()}
            label="Google searches"
          />
          <Equiv
            icon={<Mail size={14} />}
            value={report.equivalences.emailsSent.toLocaleString()}
            label="emails sent"
          />
          <Equiv
            icon={<Video size={14} />}
            value={`${report.equivalences.videoCallMinutes}`}
            label="min video call"
          />
          <Equiv
            icon={<Car size={14} />}
            value={`${report.equivalences.carKm}`}
            label="km driving"
          />
          <Equiv
            icon={<Plane size={14} />}
            value={`${report.equivalences.flightKm}`}
            label="km flying"
          />
          <Equiv
            icon={<TreePine size={14} />}
            value={`${report.equivalences.treeDaysToOffset}`}
            label="tree-days to offset"
          />
        </div>
      </section>

      {/* ROW 4 — Trend */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Trend — last 6 months (gCO₂e)
        </div>
        <div className="flex items-end gap-2 h-24">
          {report.trend.map((pt) => {
            const totalH = (pt.totalGrams / maxTrend) * 100;
            const s2H = (pt.scope2Grams / maxTrend) * 100;
            return (
              <div key={pt.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end h-full gap-0.5">
                  <div
                    className="flex-1 rounded-t"
                    style={{
                      height: `${totalH}%`,
                      backgroundColor: "#7C3AED33",
                    }}
                    title={`Total: ${pt.totalGrams.toFixed(2)} g`}
                  />
                  <div
                    className="flex-1 rounded-t"
                    style={{
                      height: `${s2H}%`,
                      backgroundColor: "#009CD6",
                    }}
                    title={`Scope 2: ${pt.scope2Grams.toFixed(2)} g`}
                  />
                </div>
                <div className="text-[9px] text-mid-gray">{pt.month.slice(5)}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px] text-mid-gray">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ backgroundColor: "#009CD6" }} /> Scope 2</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ backgroundColor: "#7C3AED33" }} /> Total (S2+S3)</span>
        </div>
      </section>

      {/* ROW 5 — Activity share */}
      <section className="rounded-lg border border-border-gray bg-white p-4">
        <div className="text-sm font-semibold text-dark-navy mb-3">
          Emissions by Activity
        </div>
        <div className="space-y-2">
          {report.byActivity.map((a) => (
            <div key={a.activity} className="text-xs">
              <div className="flex justify-between text-mid-gray mb-0.5">
                <span>{a.activity} · {a.calls} call{a.calls === 1 ? "" : "s"}</span>
                <span className="tabular-nums">{a.percent}% · {a.carbonGrams.toFixed(2)} g</span>
              </div>
              <div className="h-1.5 bg-light-gray rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(a.carbonGrams / maxActivity) * 100}%`,
                    backgroundColor: "#009CD6",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ROW 6 — Disclosure notes */}
      <details className="rounded-lg border border-border-gray bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-dark-navy">
          IPSASB SRS 1 Disclosure Notes
        </summary>
        <div className="mt-3 space-y-3 text-xs text-dark-gray leading-relaxed">
          <div>
            <div className="font-semibold text-dark-navy mb-1">Methodology</div>
            <p>{report.disclosureNotes.methodology}</p>
          </div>
          <div>
            <div className="font-semibold text-dark-navy mb-1">Limitations</div>
            <p>{report.disclosureNotes.limitations}</p>
          </div>
          <div>
            <div className="font-semibold text-dark-navy mb-1">Standards</div>
            <p>{report.disclosureNotes.standard}</p>
          </div>
          <div>
            <div className="font-semibold text-dark-navy mb-1">Sources</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {report.disclosureNotes.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      {/* ROW 7 — Export */}
      <div>
        <button
          type="button"
          onClick={() => downloadReport(report)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-itu-blue text-white text-sm font-medium hover:bg-itu-blue-dark"
        >
          <Download size={14} /> Download Emissions Report
        </button>
      </div>
    </div>
  );
}

function Equiv({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded border border-border-gray bg-itu-blue-pale/30">
      <span className="text-itu-blue-dark shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="font-semibold text-dark-navy text-sm tabular-nums">
          {value}
        </div>
        <div className="text-mid-gray text-[10px]">{label}</div>
      </div>
    </div>
  );
}

// Zap currently unused but reserved for a future "instantaneous power" card.
void Zap;
