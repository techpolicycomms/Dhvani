import { readAllUsage, type UsageRecord } from "./usageLogger";

/**
 * Per-user rate limiting + org-wide monthly budget enforcement.
 *
 * Two levels of protection:
 *   1. In-memory sliding-window counters for per-user hourly / daily caps.
 *      Fast, allocation-free, suitable for a single-instance deployment.
 *   2. A read-through usage-log aggregation for the org-wide monthly
 *      budget cap (read at most once per minute; cached in-memory).
 *
 * The in-memory counters are inherently per-process. For multi-instance
 * production, swap the Map in UserCounters for Redis — the public API
 * (`checkAndReserve`, `release`) stays identical.
 */

const DEFAULT_PER_HOUR = 60;
const DEFAULT_PER_DAY = 240;
const DEFAULT_MONTHLY_BUDGET_USD = 500;

function env(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function limits() {
  return {
    perHour: env("RATE_LIMIT_MINUTES_PER_HOUR", DEFAULT_PER_HOUR),
    perDay: env("RATE_LIMIT_MINUTES_PER_DAY", DEFAULT_PER_DAY),
    monthlyBudgetUsd: env("RATE_LIMIT_MONTHLY_BUDGET_USD", DEFAULT_MONTHLY_BUDGET_USD),
  };
}

type UserWindow = {
  hourMinutes: number;
  hourStart: number;
  dayMinutes: number;
  dayStart: number;
};

// In-memory per-user state. Keyed by stable userId (Entra oid) — NOT
// email, since emails can theoretically change.
const state: Map<string, UserWindow> = new Map();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rollWindows(w: UserWindow, now: number): UserWindow {
  if (now - w.hourStart >= HOUR_MS) {
    w.hourMinutes = 0;
    w.hourStart = now;
  }
  if (now - w.dayStart >= DAY_MS) {
    w.dayMinutes = 0;
    w.dayStart = now;
  }
  return w;
}

function getWindow(userId: string, now: number): UserWindow {
  let w = state.get(userId);
  if (!w) {
    w = { hourMinutes: 0, hourStart: now, dayMinutes: 0, dayStart: now };
    state.set(userId, w);
  }
  return rollWindows(w, now);
}

// Cached monthly-budget view. Refresh at most once per minute so we're
// not re-parsing the usage log on every request.
let monthlyCache: { spent: number; minutes: number; users: number; at: number } | null = null;
const MONTHLY_CACHE_MS = 60 * 1000;

async function monthlySpend() {
  const now = Date.now();
  if (monthlyCache && now - monthlyCache.at < MONTHLY_CACHE_MS) {
    return monthlyCache;
  }
  const recs = await readAllUsage();
  const start = monthStart();
  let spent = 0;
  let minutes = 0;
  const users = new Set<string>();
  for (const r of recs) {
    if (new Date(r.timestamp).getTime() >= start) {
      spent += r.whisperCost;
      minutes += r.audioDurationSeconds / 60;
      users.add(r.userId);
    }
  }
  monthlyCache = { spent, minutes, users: users.size, at: now };
  return monthlyCache;
}

function monthStart(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export type QuotaStatus = {
  allowed: boolean;
  reason?: "user-hour" | "user-day" | "org-month";
  retryAfterSeconds?: number;
  limits: {
    perHour: number;
    perDay: number;
    monthlyBudgetUsd: number;
  };
  remaining: {
    hourMinutes: number;
    dayMinutes: number;
    monthBudgetUsd: number;
  };
};

/**
 * Check whether the user may transcribe `seconds` of audio right now,
 * and if so, reserve that allocation against their window counters.
 *
 * Returns `allowed: false` with a machine-readable reason if the request
 * should be refused; UI surfaces a friendly message based on this.
 */
export async function checkAndReserve(
  userId: string,
  seconds: number
): Promise<QuotaStatus> {
  const L = limits();
  const now = Date.now();
  const minutes = seconds / 60;
  const w = getWindow(userId, now);

  const monthly = await monthlySpend();
  const monthRemaining = L.monthlyBudgetUsd - monthly.spent;

  const remaining = {
    hourMinutes: Math.max(0, L.perHour - w.hourMinutes),
    dayMinutes: Math.max(0, L.perDay - w.dayMinutes),
    monthBudgetUsd: Math.max(0, monthRemaining),
  };

  if (monthRemaining <= 0) {
    return {
      allowed: false,
      reason: "org-month",
      retryAfterSeconds: secondsUntilNextMonth(),
      limits: L,
      remaining,
    };
  }
  if (w.hourMinutes + minutes > L.perHour) {
    return {
      allowed: false,
      reason: "user-hour",
      retryAfterSeconds: Math.ceil((HOUR_MS - (now - w.hourStart)) / 1000),
      limits: L,
      remaining,
    };
  }
  if (w.dayMinutes + minutes > L.perDay) {
    return {
      allowed: false,
      reason: "user-day",
      retryAfterSeconds: Math.ceil((DAY_MS - (now - w.dayStart)) / 1000),
      limits: L,
      remaining,
    };
  }

  // Reserve.
  w.hourMinutes += minutes;
  w.dayMinutes += minutes;
  return {
    allowed: true,
    limits: L,
    remaining: {
      hourMinutes: Math.max(0, L.perHour - w.hourMinutes),
      dayMinutes: Math.max(0, L.perDay - w.dayMinutes),
      monthBudgetUsd: Math.max(0, monthRemaining),
    },
  };
}

/**
 * Release a previously-reserved allocation. Call this when the Whisper
 * request failed, to avoid "charging" the user for audio that wasn't
 * actually transcribed.
 */
export function release(userId: string, seconds: number): void {
  const w = state.get(userId);
  if (!w) return;
  const minutes = seconds / 60;
  w.hourMinutes = Math.max(0, w.hourMinutes - minutes);
  w.dayMinutes = Math.max(0, w.dayMinutes - minutes);
}

/**
 * Lightweight per-user request counter for chat endpoints
 * (/api/summarize, /api/ask, /api/followup). Separate from the
 * minutes-based transcription quota — we don't bill chat calls the
 * same way and the request pattern is bursty. Defaults to 30 calls
 * per hour per user; override with RATE_LIMIT_CHAT_PER_HOUR.
 *
 * Like the transcription counter this is in-process; swap for Redis
 * in a multi-instance deployment without changing the public API.
 */
type ChatWindow = { count: number; start: number };
const chatState: Map<string, ChatWindow> = new Map();

export type ChatRateResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkChatRate(userId: string): ChatRateResult {
  const perHour = env("RATE_LIMIT_CHAT_PER_HOUR", 30);
  const now = Date.now();
  let w = chatState.get(userId);
  if (!w || now - w.start >= HOUR_MS) {
    w = { count: 0, start: now };
    chatState.set(userId, w);
  }
  if (w.count >= perHour) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((HOUR_MS - (now - w.start)) / 1000),
    };
  }
  w.count += 1;
  return { allowed: true };
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.ceil((next.getTime() - now.getTime()) / 1000);
}

/**
 * Return a user's current quota without reserving anything. Used by
 * the /api/me/usage endpoint to populate the "X minutes remaining" UI.
 */
export async function getQuotaSnapshot(userId: string): Promise<QuotaStatus> {
  const L = limits();
  const now = Date.now();
  const w = getWindow(userId, now);
  const monthly = await monthlySpend();
  return {
    allowed: monthly.spent < L.monthlyBudgetUsd,
    limits: L,
    remaining: {
      hourMinutes: Math.max(0, L.perHour - w.hourMinutes),
      dayMinutes: Math.max(0, L.perDay - w.dayMinutes),
      monthBudgetUsd: Math.max(0, L.monthlyBudgetUsd - monthly.spent),
    },
  };
}

/**
 * Admin kill-switch check. Respects SERVICE_ENABLED=false set via env.
 */
export function isServiceEnabled(): boolean {
  const raw = (process.env.SERVICE_ENABLED || "").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

export function aggregateUsage(records: UsageRecord[]) {
  return records;
}
