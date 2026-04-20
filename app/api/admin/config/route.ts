import { NextRequest, NextResponse } from "next/server";
import { auth, isAdminEmail, isAuthConfigured } from "@/lib/auth";
import { isServiceEnabled } from "@/lib/rateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/config — read or update service-level controls.
 *
 * v1 keeps this in-process (process.env overrides, module-scoped state).
 * This is good enough for single-instance Azure Web App deployments.
 * For multi-instance replication, back with Redis or a config service.
 *
 * Admin-only: both methods require an ADMIN_EMAILS session.
 */

type RuntimeConfig = {
  rateLimitMinutesPerHour: number;
  rateLimitMinutesPerDay: number;
  monthlyBudgetUsd: number;
  serviceEnabled: boolean;
  adminEmails: string[];
};

// In-memory overrides applied on top of env vars. Admin POSTs mutate
// this; the rate limiter reads from process.env, so we also mirror
// changes into process.env so the existing call sites pick them up
// without any refactor.
const overrides: Partial<RuntimeConfig> = {};

function readConfig(): RuntimeConfig {
  return {
    rateLimitMinutesPerHour:
      overrides.rateLimitMinutesPerHour ??
      Number(process.env.RATE_LIMIT_MINUTES_PER_HOUR || 60),
    rateLimitMinutesPerDay:
      overrides.rateLimitMinutesPerDay ??
      Number(process.env.RATE_LIMIT_MINUTES_PER_DAY || 240),
    monthlyBudgetUsd:
      overrides.monthlyBudgetUsd ??
      Number(process.env.RATE_LIMIT_MONTHLY_BUDGET_USD || 500),
    serviceEnabled: overrides.serviceEnabled ?? isServiceEnabled(),
    adminEmails: (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

async function requireAdmin() {
  if (!isAuthConfigured()) return { status: 403 as const };
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { status: 401 as const };
  if (!isAdminEmail(email)) return { status: 403 as const };
  return { status: 200 as const };
}

export async function GET() {
  const check = await requireAdmin();
  if (check.status !== 200) {
    return NextResponse.json(
      { error: check.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: check.status }
    );
  }
  return NextResponse.json(readConfig());
}

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if (check.status !== 200) {
    return NextResponse.json(
      { error: check.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: check.status }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Partial<RuntimeConfig>;

  if (typeof body.rateLimitMinutesPerHour === "number") {
    overrides.rateLimitMinutesPerHour = Math.max(1, body.rateLimitMinutesPerHour);
    process.env.RATE_LIMIT_MINUTES_PER_HOUR = String(
      overrides.rateLimitMinutesPerHour
    );
  }
  if (typeof body.rateLimitMinutesPerDay === "number") {
    overrides.rateLimitMinutesPerDay = Math.max(1, body.rateLimitMinutesPerDay);
    process.env.RATE_LIMIT_MINUTES_PER_DAY = String(
      overrides.rateLimitMinutesPerDay
    );
  }
  if (typeof body.monthlyBudgetUsd === "number") {
    overrides.monthlyBudgetUsd = Math.max(0, body.monthlyBudgetUsd);
    process.env.RATE_LIMIT_MONTHLY_BUDGET_USD = String(overrides.monthlyBudgetUsd);
  }
  if (typeof body.serviceEnabled === "boolean") {
    overrides.serviceEnabled = body.serviceEnabled;
    process.env.SERVICE_ENABLED = body.serviceEnabled ? "true" : "false";
  }

  return NextResponse.json(readConfig());
}
