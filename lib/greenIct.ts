/**
 * Green ICT — AI carbon and energy accounting.
 *
 * Methodology: One-Token Model (Luccioni et al. 2024, "Power Hungry
 * Processing"; LLMCarbon framework). Per-call energy is multiplied by
 * PUE and the grid carbon intensity for the deployment region to yield
 * Scope 2 emissions. A conservative embodied-emissions factor accounts
 * for GPU manufacturing and data-centre construction (Scope 3).
 *
 * Disclosures target IPSASB SRS 1 (Climate-related Disclosures,
 * effective Jan 2026) with IFRS S2 alignment for cross-sector
 * comparability.
 *
 * Numbers are deliberately conservative order-of-magnitude estimates;
 * Azure does not publish per-deployment energy data, so all figures
 * carry the uncertainty noted in `disclosureNotes.limitations`.
 */

import { readAllUsage, type UsageRecord } from "@/lib/usageLogger";

export const EMISSIONS_CONSTANTS = {
  // Energy per API call (Wh) — GPT-4o family inference benchmarks
  // synthesised from One-Token Model (Luccioni et al. 2024) and
  // "How Hungry is AI?" (2025). Transcription is heavier than chat
  // because of the audio encoder pass.
  energyPerTranscriptionChunk: 0.42,
  energyPerChatCall: 0.35,

  // Azure-reported Power Usage Effectiveness (2024 sustainability
  // report, fleet average).
  pueAzure: 1.18,

  // Grid carbon intensity (gCO2/kWh) by Azure region.
  // Source: Electricity Maps 2025 + IEA national averages.
  gridIntensity: {
    swedencentral: 8,
    westeurope: 300,
    eastus: 380,
    westus: 230,
    default: 400,
  } as Record<string, number>,

  // Scope 3 embodied-emissions multiplier applied to Scope 2.
  // 30% is the mid-range from Luccioni et al. (2024) — conservative
  // given the absence of GPU-level lifecycle data from Azure.
  embodiedFactor: 0.3,

  // Human-scale equivalence factors for readable reporting.
  comparisons: {
    googleSearchWh: 0.0003,
    emailWh: 0.004,
    videoCallPerMinWh: 0.36,
    flightPerKmGrams: 255,
    carPerKmGrams: 120,
    treeDailyAbsorptionGrams: 60,
  },
} as const;

export type EmissionsPeriod = "monthly" | "quarterly" | "annual";

export type EmissionsReport = {
  period: { from: string; to: string; label: EmissionsPeriod };

  scope2: {
    totalEnergyWh: number;
    totalEnergykWh: number;
    carbonGrams: number;
    carbonKg: number;
    byModel: {
      transcription: {
        calls: number;
        energyWh: number;
        carbonGrams: number;
      };
      chat: {
        calls: number;
        energyWh: number;
        carbonGrams: number;
      };
    };
    gridRegion: string;
    gridIntensity: number;
  };

  scope3: {
    estimatedCarbonGrams: number;
    methodology: string;
  };

  totalCarbonGrams: number;
  totalCarbonKg: number;

  equivalences: {
    googleSearches: number;
    emailsSent: number;
    videoCallMinutes: number;
    carKm: number;
    flightKm: number;
    treeDaysToOffset: number;
  };

  // Monthly series for trend charts (last 6 months, oldest first).
  trend: Array<{ month: string; scope2Grams: number; totalGrams: number }>;

  // Activity share by call type.
  byActivity: Array<{
    activity: "Transcription" | "Summaries" | "Ask AI" | "Follow-up";
    calls: number;
    carbonGrams: number;
    percent: number;
  }>;

  disclosureNotes: {
    methodology: string;
    limitations: string;
    sources: string[];
    standard: string;
  };
};

/**
 * Chat calls (summary / ask / followup) are tracked in a sibling JSONL
 * file so the existing transcription log shape stays stable.
 */
export type ChatUsageRecord = {
  userId: string;
  timestamp: string;
  activity: "summary" | "ask" | "followup";
  inputTokens?: number;
  outputTokens?: number;
};

import { promises as fs } from "node:fs";
import path from "node:path";

function chatLogPath(): string {
  return (
    process.env.CHAT_USAGE_LOG_PATH ||
    path.join(process.cwd(), "data", "chat-usage-log.jsonl")
  );
}

export async function logChatUsage(rec: ChatUsageRecord): Promise<void> {
  try {
    const p = chatLogPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.appendFile(p, JSON.stringify(rec) + "\n", "utf8");
  } catch (err) {
    console.warn("dhvani: failed to append chat usage log", err);
  }
}

async function readAllChatUsage(): Promise<ChatUsageRecord[]> {
  try {
    const p = chatLogPath();
    const content = await fs.readFile(p, "utf8");
    const out: ChatUsageRecord[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
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

function periodWindow(
  label: EmissionsPeriod,
  year: number,
  month: number
): { from: Date; to: Date } {
  if (label === "annual") {
    return {
      from: new Date(Date.UTC(year, 0, 1)),
      to: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }
  if (label === "quarterly") {
    const q = Math.floor((month - 1) / 3);
    return {
      from: new Date(Date.UTC(year, q * 3, 1)),
      to: new Date(Date.UTC(year, q * 3 + 3, 1)),
    };
  }
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

function resolveGrid(region?: string): {
  region: string;
  intensity: number;
} {
  const key = (region || "").toLowerCase();
  const map = EMISSIONS_CONSTANTS.gridIntensity;
  if (map[key] !== undefined) return { region: key, intensity: map[key] };
  return { region: "default", intensity: map.default };
}

export async function getEmissionsReport(
  label: EmissionsPeriod = "monthly",
  year?: number,
  month?: number
): Promise<EmissionsReport> {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth() + 1;
  const { from, to } = periodWindow(label, y, m);
  const region = process.env.AZURE_OPENAI_REGION || "default";
  const { region: gridRegion, intensity } = resolveGrid(region);

  const [usage, chat] = await Promise.all([
    readAllUsage(),
    readAllChatUsage(),
  ]);

  const inWindow = <T extends { timestamp: string }>(rec: T): boolean => {
    const t = new Date(rec.timestamp).getTime();
    return t >= from.getTime() && t < to.getTime();
  };

  const trxInRange = usage.filter(inWindow);
  const chatInRange = chat.filter(inWindow);

  // Scope 2 — energy consumed, multiplied by PUE and grid intensity.
  const { pueAzure, energyPerTranscriptionChunk, energyPerChatCall } =
    EMISSIONS_CONSTANTS;
  const trxEnergyWh = trxInRange.length * energyPerTranscriptionChunk * pueAzure;
  const chatEnergyWh = chatInRange.length * energyPerChatCall * pueAzure;
  const totalEnergyWh = trxEnergyWh + chatEnergyWh;
  const totalEnergykWh = totalEnergyWh / 1000;
  const trxCarbonGrams = (trxEnergyWh / 1000) * intensity;
  const chatCarbonGrams = (chatEnergyWh / 1000) * intensity;
  const scope2Grams = trxCarbonGrams + chatCarbonGrams;

  const scope3Grams = scope2Grams * EMISSIONS_CONSTANTS.embodiedFactor;
  const totalGrams = scope2Grams + scope3Grams;

  const { comparisons } = EMISSIONS_CONSTANTS;
  const equivalences = {
    googleSearches: Math.round(totalEnergyWh / comparisons.googleSearchWh),
    emailsSent: Math.round(totalEnergyWh / comparisons.emailWh),
    videoCallMinutes: Math.round(totalEnergyWh / comparisons.videoCallPerMinWh),
    carKm: +(totalGrams / comparisons.carPerKmGrams).toFixed(2),
    flightKm: +(totalGrams / comparisons.flightPerKmGrams).toFixed(2),
    treeDaysToOffset: +(totalGrams / comparisons.treeDailyAbsorptionGrams).toFixed(1),
  };

  // Six-month trend — walk back month by month from `to`.
  const trend: EmissionsReport["trend"] = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(to);
    mStart.setUTCMonth(mStart.getUTCMonth() - (i + 1));
    const mEnd = new Date(to);
    mEnd.setUTCMonth(mEnd.getUTCMonth() - i);
    const monthLabel = `${mStart.getUTCFullYear()}-${String(
      mStart.getUTCMonth() + 1
    ).padStart(2, "0")}`;
    const between = <T extends { timestamp: string }>(rec: T): boolean => {
      const t = new Date(rec.timestamp).getTime();
      return t >= mStart.getTime() && t < mEnd.getTime();
    };
    const trxC = usage.filter(between).length;
    const chatC = chat.filter(between).length;
    const tWh = trxC * energyPerTranscriptionChunk * pueAzure;
    const cWh = chatC * energyPerChatCall * pueAzure;
    const s2 = ((tWh + cWh) / 1000) * intensity;
    const total = s2 * (1 + EMISSIONS_CONSTANTS.embodiedFactor);
    trend.push({
      month: monthLabel,
      scope2Grams: +s2.toFixed(2),
      totalGrams: +total.toFixed(2),
    });
  }

  // Activity share.
  const summaryCount = chatInRange.filter((r) => r.activity === "summary").length;
  const askCount = chatInRange.filter((r) => r.activity === "ask").length;
  const followupCount = chatInRange.filter((r) => r.activity === "followup").length;
  const activityRaw = [
    { activity: "Transcription" as const, calls: trxInRange.length, carbonGrams: trxCarbonGrams },
    {
      activity: "Summaries" as const,
      calls: summaryCount,
      carbonGrams:
        (summaryCount * energyPerChatCall * pueAzure * intensity) / 1000,
    },
    {
      activity: "Ask AI" as const,
      calls: askCount,
      carbonGrams: (askCount * energyPerChatCall * pueAzure * intensity) / 1000,
    },
    {
      activity: "Follow-up" as const,
      calls: followupCount,
      carbonGrams:
        (followupCount * energyPerChatCall * pueAzure * intensity) / 1000,
    },
  ];
  const activityTotal = activityRaw.reduce((s, a) => s + a.carbonGrams, 0) || 1;
  const byActivity = activityRaw.map((a) => ({
    ...a,
    percent: +((a.carbonGrams / activityTotal) * 100).toFixed(1),
  }));

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label,
    },
    scope2: {
      totalEnergyWh: +totalEnergyWh.toFixed(2),
      totalEnergykWh: +totalEnergykWh.toFixed(4),
      carbonGrams: +scope2Grams.toFixed(2),
      carbonKg: +(scope2Grams / 1000).toFixed(4),
      byModel: {
        transcription: {
          calls: trxInRange.length,
          energyWh: +trxEnergyWh.toFixed(2),
          carbonGrams: +trxCarbonGrams.toFixed(2),
        },
        chat: {
          calls: chatInRange.length,
          energyWh: +chatEnergyWh.toFixed(2),
          carbonGrams: +chatCarbonGrams.toFixed(2),
        },
      },
      gridRegion,
      gridIntensity: intensity,
    },
    scope3: {
      estimatedCarbonGrams: +scope3Grams.toFixed(2),
      methodology:
        "Embodied factor of 30% applied to Scope 2 per Luccioni et al. (2024).",
    },
    totalCarbonGrams: +totalGrams.toFixed(2),
    totalCarbonKg: +(totalGrams / 1000).toFixed(4),
    equivalences,
    trend,
    byActivity,
    disclosureNotes: {
      methodology:
        "Emissions calculated using the One-Token Model framework. " +
        "Scope 2 = energy per call × PUE × grid carbon intensity. " +
        "Grid intensity sourced from Electricity Maps and IEA (2025). " +
        "PUE from Microsoft Azure sustainability report (2024).",
      limitations:
        "Scope 3 estimates use a 30% embodied factor (Luccioni et al. 2024); " +
        "actual embodied emissions depend on GPU manufacturing location and " +
        "data-centre age, which Azure does not publicly disclose per-deployment. " +
        "Scope 1 is zero — Dhvani operates no on-premise infrastructure.",
      sources: [
        "Luccioni et al., Power Hungry Processing (2024)",
        "LLMCarbon framework",
        'How Hungry is AI? (2025) — "One-Token Model"',
        "Electricity Maps — grid carbon intensity (2025)",
        "Microsoft Azure — 2024 Sustainability Report (PUE)",
        "IEA — 2025 national average grid intensities",
      ],
      standard:
        "IPSASB SRS 1 Climate-related Disclosures (effective January 2026). " +
        "Aligned with GHG Protocol (Scope 1/2/3) and IFRS S2 for cross-sector comparability.",
    },
  };
}

/** Emissions for a single user's activity in the last N days. */
export async function getUserEmissions(
  userId: string,
  days = 30
): Promise<{
  minutes: number;
  carbonGrams: number;
  googleSearches: number;
}> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const region = process.env.AZURE_OPENAI_REGION || "default";
  const { intensity } = resolveGrid(region);
  const { pueAzure, energyPerTranscriptionChunk, comparisons } =
    EMISSIONS_CONSTANTS;
  const records: UsageRecord[] = (await readAllUsage()).filter(
    (r) => r.userId === userId && new Date(r.timestamp).getTime() >= since
  );
  const totalSeconds = records.reduce(
    (s, r) => s + (r.audioDurationSeconds || 0),
    0
  );
  const minutes = totalSeconds / 60;
  const energyWh = records.length * energyPerTranscriptionChunk * pueAzure;
  const scope2Grams = (energyWh / 1000) * intensity;
  const totalGrams = scope2Grams * (1 + EMISSIONS_CONSTANTS.embodiedFactor);
  return {
    minutes: +minutes.toFixed(1),
    carbonGrams: +totalGrams.toFixed(2),
    googleSearches: Math.round(energyWh / comparisons.googleSearchWh),
  };
}
