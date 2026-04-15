import { NextRequest, NextResponse } from "next/server";
import { getActiveUser, getGraphAccessToken } from "@/lib/auth";
import {
  cacheGet,
  cacheSet,
  fromGraphEvent,
  handleGraphError,
  type Meeting,
} from "@/lib/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 1000; // tighter TTL so reminders fire near-realtime

/**
 * GET /api/calendar/upcoming?hours=8
 *
 * Returns online meetings starting in the next N hours (default 8, capped
 * at 24). Used by useMeetingReminders to drive the in-app countdown
 * banner.
 */
export async function GET(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accessToken = await getGraphAccessToken();
  if (!accessToken) {
    return NextResponse.json({ meetings: [], reason: "no-graph-token" });
  }

  const requested = parseInt(
    req.nextUrl.searchParams.get("hours") || "8",
    10
  );
  const hours =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, 24) : 8;

  const userId = user.userId;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const cacheKey = `upcoming:${userId}:${hours}:${Math.floor(
    Date.now() / CACHE_TTL_MS
  )}`;
  const cached = cacheGet<Meeting[]>(cacheKey);
  if (cached) {
    return NextResponse.json({ meetings: cached, cached: true });
  }

  const start = new Date();
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);

  try {
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
    url.searchParams.set("startDateTime", start.toISOString());
    url.searchParams.set("endDateTime", end.toISOString());
    url.searchParams.set(
      "$select",
      "id,subject,start,end,isOnlineMeeting,onlineMeeting,onlineMeetingUrl,location,attendees,organizer"
    );
    url.searchParams.set("$orderby", "start/dateTime");
    url.searchParams.set("$top", "25");

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(
        `Graph ${res.status}: ${detail.slice(0, 200)}`
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const body = (await res.json()) as { value?: unknown[] };
    const events = Array.isArray(body.value) ? body.value : [];
    const meetings: Meeting[] = [];
    for (const ev of events) {
      const m = fromGraphEvent(ev as Parameters<typeof fromGraphEvent>[0]);
      if (m && (m.joinUrl || m.platform !== "other")) meetings.push(m);
    }
    cacheSet(cacheKey, meetings, CACHE_TTL_MS);
    return NextResponse.json({ meetings });
  } catch (err) {
    return handleGraphError(err);
  }
}
