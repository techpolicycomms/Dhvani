/**
 * Shared types + helpers for the Microsoft Graph calendar integration.
 *
 * Dhvani's calendar code is intentionally tiny: we read the user's
 * `/me/calendarView` for a given window, translate Graph's verbose event
 * shape into a platform-agnostic Meeting record, and short-circuit any
 * event that isn't an online meeting (no joinUrl).
 */

import { NextResponse } from "next/server";

export type MeetingPlatform = "teams" | "zoom" | "meet" | "other";

export type Meeting = {
  /** Microsoft Graph event id — stable across refreshes. */
  id: string;
  subject: string;
  /** ISO 8601 UTC start. */
  start: string;
  /** ISO 8601 UTC end. */
  end: string;
  platform: MeetingPlatform;
  joinUrl?: string;
  /** Display-name list of accepted/required attendees, max 8. */
  attendees: string[];
  /** Free-text location, useful when joinUrl isn't present. */
  location?: string;
  organizer?: string;
};

/** Detect the meeting platform from a join URL or location string. */
export function detectPlatform(
  joinUrl?: string | null,
  location?: string | null
): MeetingPlatform {
  const haystack = `${joinUrl || ""} ${location || ""}`.toLowerCase();
  if (haystack.includes("teams.microsoft.com")) return "teams";
  if (haystack.includes("zoom.us")) return "zoom";
  if (haystack.includes("meet.google.com")) return "meet";
  return "other";
}

export const PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  teams: "Teams",
  zoom: "Zoom",
  meet: "Meet",
  other: "Other",
};

/**
 * Tailwind classes for the platform badge — kept here so the same pill
 * style renders identically across MeetingList + transcript history.
 */
export const PLATFORM_BADGE_CLASS: Record<MeetingPlatform, string> = {
  teams: "bg-[#EDEDFE] text-[#6264ED]",
  zoom: "bg-[#E5F0FF] text-[#2980FF]",
  meet: "bg-[#E5F5F0] text-[#17A882]",
  other: "bg-light-gray text-mid-gray",
};

/** True iff `now` falls within the meeting's start/end window. */
export function isOngoing(meeting: Meeting, now: Date = new Date()): boolean {
  const t = now.getTime();
  return (
    t >= new Date(meeting.start).getTime() &&
    t < new Date(meeting.end).getTime()
  );
}

/**
 * Translate a thrown Microsoft Graph error into a NextResponse the
 * calendar routes can return verbatim. Kept in a shared module so both
 * /today and /upcoming handlers can use it without a "not a valid Route
 * export field" build error from Next.
 */
export function handleGraphError(err: unknown): NextResponse {
  const e = err as { status?: number; message?: string };
  if (e.status === 401 || e.status === 403) {
    return NextResponse.json({
      meetings: [],
      reason: e.status === 401 ? "token-expired" : "forbidden",
    });
  }
  return NextResponse.json(
    { error: e.message || "Failed to fetch calendar." },
    { status: 502 }
  );
}

/** Whole-minute count from `now` to the meeting's start; negative if past. */
export function minutesUntilStart(
  meeting: Meeting,
  now: Date = new Date()
): number {
  return Math.floor((new Date(meeting.start).getTime() - now.getTime()) / 60000);
}

/**
 * Tiny TTL cache for Microsoft Graph responses. Keyed by userId+window so
 * concurrent users don't see each other's events. Lives in module scope —
 * fine for a single-instance Web App; the rate-limiter has the same caveat.
 */
type CacheEntry<T> = { value: T; expiresAt: number };
const _cache = new Map<string, CacheEntry<unknown>>();
// Soft cap: protect against unbounded growth in long-running pods. When
// reached, we drop the oldest insertion (Map preserves insertion order).
const MAX_CACHE_ENTRIES = 10_000;

export function cacheGet<T>(key: string): T | undefined {
  if (!key) return undefined;
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    _cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  if (!key) return;
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Map a Microsoft Graph event to Dhvani's Meeting type. Returns null if
 * the event has no usable start/end or no online-meeting indicator.
 */
type GraphEvent = {
  id?: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string };
  onlineMeetingUrl?: string;
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress?: { name?: string; address?: string };
    status?: { response?: string };
  }>;
  organizer?: { emailAddress?: { name?: string } };
};

export function fromGraphEvent(ev: GraphEvent): Meeting | null {
  const id = ev.id;
  const startIso = ev.start?.dateTime;
  const endIso = ev.end?.dateTime;
  if (!id || !startIso || !endIso) return null;

  // Graph returns dateTime without a 'Z' even though it's UTC by default
  // when we pass `Prefer: outlook.timezone="UTC"`. Normalize it.
  const start = startIso.endsWith("Z") ? startIso : `${startIso}Z`;
  const end = endIso.endsWith("Z") ? endIso : `${endIso}Z`;

  const joinUrl = ev.onlineMeeting?.joinUrl || ev.onlineMeetingUrl || undefined;
  const location = ev.location?.displayName || undefined;

  const attendees = (ev.attendees || [])
    .filter((a) => a.status?.response !== "declined")
    .map((a) => a.emailAddress?.name || a.emailAddress?.address || "")
    .filter(Boolean)
    .slice(0, 8);

  return {
    id,
    subject: ev.subject?.trim() || "(No subject)",
    start,
    end,
    platform: detectPlatform(joinUrl, location),
    joinUrl,
    attendees,
    location,
    organizer: ev.organizer?.emailAddress?.name || undefined,
  };
}
