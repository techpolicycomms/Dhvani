import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
export async function GET() {
  const session = await auth();
  const user = session?.user as
    | { userId?: string; email?: string }
    | undefined;
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accessToken = (session as { accessToken?: string }).accessToken;
  if (!accessToken) {
    // The user is signed in but we never captured a Graph token (likely
    // an old session from before Calendars.Read was added). Surface an
    // empty list so the UI degrades gracefully.
    return NextResponse.json({ meetings: [], reason: "no-graph-token" });
  }

  const userId = user.userId || user.email;
  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = `today:${userId}:${day}`;
  const cached = cacheGet<Meeting[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ meetings: cached, cached: true });
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  try {
    const meetings = await fetchCalendarView(
      accessToken,
      start.toISOString(),
      end.toISOString()
    );
    cacheSet(cacheKey, meetings, CACHE_TTL_MS);
    return NextResponse.json({ meetings });
  } catch (err) {
    return handleGraphError(err);
  }
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

