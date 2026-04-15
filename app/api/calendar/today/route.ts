import { NextRequest, NextResponse } from "next/server";
import { auth, getGraphAccessToken } from "@/lib/auth";
import {
  cacheGet,
  cacheSet,
  fromGraphEvent,
  handleGraphError,
  type Meeting,
} from "@/lib/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/calendar/today
 *
 * Returns the signed-in user's online meetings for today (00:00 → 24:00 UTC
 * local-day, computed from the server clock). Calls Microsoft Graph with
 * the access token captured in the JWT during sign-in.
 *
 * Response is cached in-process for 5 minutes per user to avoid hammering
 * Graph from the home page polling loop.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accessToken = await getGraphAccessToken();
  if (!accessToken) {
    return NextResponse.json({ meetings: [], reason: "no-graph-token" });
  }

  const userId = user.userId || user.email;
  if (!userId) {
    // Defensive: a falsy userId would collide cache keys across users.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The browser tells us its IANA timezone (e.g. "Europe/Geneva") so we
  // compute "today" in the user's local day, not the server's UTC day.
  // Fall back to UTC if the header is missing or invalid.
  const tz = sanitizeTz(req.nextUrl.searchParams.get("tz"));
  const { startIso, endIso, dayKey } = localDayWindow(tz);

  const cacheKey = `today:${userId}:${dayKey}:${tz}`;
  const cached = cacheGet<Meeting[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ meetings: cached, cached: true });
  }

  try {
    const meetings = await fetchCalendarView(accessToken, startIso, endIso);
    cacheSet(cacheKey, meetings, CACHE_TTL_MS);
    return NextResponse.json({ meetings });
  } catch (err) {
    return handleGraphError(err);
  }
}

function sanitizeTz(raw: string | null): string {
  if (!raw) return "UTC";
  // IANA timezone names: letters, digits, /, _, +, -, max 64 chars.
  if (!/^[A-Za-z0-9/_+\-]{1,64}$/.test(raw)) return "UTC";
  try {
    // Will throw if Node doesn't recognise the zone.
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
}

/**
 * Compute the [00:00, 24:00) window of the *current* calendar day in
 * `tz`, expressed as ISO 8601 UTC strings, and a `dayKey` ("YYYY-MM-DD")
 * for cache invalidation.
 */
function localDayWindow(tz: string): {
  startIso: string;
  endIso: string;
  dayKey: string;
} {
  const now = new Date();
  // Format "YYYY-MM-DD HH:mm:ss" in the target timezone, then parse the
  // wall-clock fields and re-anchor against UTC by subtracting the zone
  // offset that those wall-clock fields imply.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [{ value: y }, , { value: m }, , { value: d }] = fmt.formatToParts(now);
  const dayKey = `${y}-${m}-${d}`;
  // Local midnight as if it were UTC, then subtract the zone's UTC offset
  // for that instant to get the true UTC instant of local midnight.
  const guess = new Date(`${dayKey}T00:00:00Z`);
  const offsetMin = guess.getTime() - zoneTime(guess, tz);
  const startMs = guess.getTime() + offsetMin;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    dayKey,
  };
}

function zoneTime(d: Date, tz: string): number {
  // Returns the wall-clock-as-UTC-millis representation of `d` in `tz`.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const obj: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") obj[p.type] = p.value;
  return Date.UTC(
    Number(obj.year),
    Number(obj.month) - 1,
    Number(obj.day),
    Number(obj.hour) === 24 ? 0 : Number(obj.hour),
    Number(obj.minute),
    Number(obj.second)
  );
}

async function fetchCalendarView(
  accessToken: string,
  startIso: string,
  endIso: string
): Promise<Meeting[]> {
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", startIso);
  url.searchParams.set("endDateTime", endIso);
  url.searchParams.set(
    "$select",
    "id,subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,location,attendees,organizer"
  );
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "50");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`Graph ${res.status}: ${detail.slice(0, 200)}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  const body = (await res.json()) as { value?: unknown[] };
  const events = Array.isArray(body.value) ? body.value : [];
  const meetings: Meeting[] = [];
  for (const ev of events) {
    const m = fromGraphEvent(ev as Parameters<typeof fromGraphEvent>[0]);
    // Only surface online meetings — the user picked a tool called Dhvani,
    // not a generic agenda viewer.
    if (m && (m.joinUrl || m.platform !== "other")) meetings.push(m);
  }
  return meetings;
}

