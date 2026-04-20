import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { chatDeployment } from "@/lib/openai";
import { getAIProvider } from "@/lib/providers";
import { events } from "@/lib/events";
import { logChatUsage } from "@/lib/greenIct";
import {
  extractKeywords,
  recordAnonymisedMeeting,
} from "@/lib/orgIntelligence";
import { checkChatRate } from "@/lib/rateLimiter";
import { logSecurityEvent } from "@/lib/security";
import {
  extractTasksFromLLM,
  inferDeadline,
  stripTasksBlock,
  upsertTask,
  newTaskId,
} from "@/lib/taskManager";
import { findRoleProfile } from "@/lib/roleProfiles";
import { readUserProfile } from "@/lib/userProfileStorage";
import type { TranscriptEntry } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BASE_PROMPT = `You are an expert meeting assistant. Given a transcript with speaker labels, generate a structured meeting summary. Format the response EXACTLY as follows:

## Summary
[3-5 sentence overview of what was discussed]

## Key Decisions
- [Decision 1]
- [Decision 2]

## Action Items
- [ ] [Task] — assigned to [Speaker Name] — due [date if mentioned]
- [ ] [Task] — assigned to [Speaker Name]

## Key Discussion Points
- [Topic 1]: [brief summary of what was said]
- [Topic 2]: [brief summary]

## Participants
- [Speaker 1]: [role/contribution summary]
- [Speaker 2]: [role/contribution summary]

## Keywords
[comma-separated list of 5-10 key topics discussed]

## Sentiment
[overall tone: Positive, Neutral, Negative, or Mixed]

## Talk Time
- [Speaker 1]: [estimated % of speaking time]
- [Speaker 2]: [estimated % of speaking time]

Be concise. Use the speaker names as provided. If no due date was mentioned for an action item, omit the due field. If no clear decisions were made, omit that section. If only one speaker is present, adjust accordingly.

After the summary, on a new line, emit exactly this sentinel then a JSON array of extracted tasks:

---TASKS---
[
  { "task": "specific actionable task", "assignee": "name or Unassigned", "deadline": "YYYY-MM-DD or null or natural-language", "priority": "critical|high|medium|low", "timestamp": "HH:MM:SS or null" }
]

Rules:
- Tasks must be specific and actionable ("Send updated spectrum analysis to Working Party 5D by Friday" — not "follow up").
- If the deadline is relative ("by next week"), pass it through as-is — the server will resolve it.
- Priority: "critical" only for explicit urgency language ("urgent", "ASAP", "blocker").
- If no tasks are extractable, emit an empty array: [].`;

export type ActionItem = {
  task: string;
  assignee: string;
  dueDate: string | null;
  completed: boolean;
};

export type SummaryResponse = {
  markdown: string;
  actionItems: ActionItem[];
  keywords: string[];
  sentiment: string;
  talkTime: Array<{ speaker: string; percent: number }>;
  /** Tasks auto-extracted from the transcript by the LLM. */
  extractedTasks: Array<{
    task: string;
    assignee: string;
    deadline: string | null;
    priority: "critical" | "high" | "medium" | "low";
    timestamp: string | null;
  }>;
};

const MAX_ENTRIES = 10_000;
const MAX_TRANSCRIPT_CHARS = 120_000;

/**
 * POST /api/summarize
 *
 * Accepts a transcript and optional meeting subject, returns a
 * structured AI-generated summary with parsed action items.
 */
export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkChatRate(user.userId);
  if (!rate.allowed) {
    logSecurityEvent({
      type: "rate_limit",
      userId: user.userId,
      details: `summarize hourly limit — retry in ${rate.retryAfterSeconds}s`,
    });
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  let body: {
    transcript?: TranscriptEntry[];
    meetingSubject?: string;
    speakerNames?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const entries = Array.isArray(body.transcript) ? body.transcript : [];
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "Transcript is empty." },
      { status: 400 }
    );
  }
  if (entries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { error: `Too many entries (max ${MAX_ENTRIES}).` },
      { status: 413 }
    );
  }

  const speakerNames = body.speakerNames || {};

  const lines: string[] = [];
  if (body.meetingSubject) {
    lines.push(`Meeting: ${body.meetingSubject.slice(0, 200)}\n`);
  }
  for (const e of entries) {
    if (!e || typeof e.text !== "string" || !e.text.trim()) continue;
    // Prefer session-stable id, fall back to the legacy per-chunk raw id.
    const id = e.stableSpeakerId || e.rawSpeaker;
    const speaker =
      (id && speakerNames[id]) || e.speaker || id || "Unknown";
    lines.push(`[${speaker}]: ${e.text.trim()}`);
  }
  let transcriptText = lines.join("\n");
  if (transcriptText.length > MAX_TRANSCRIPT_CHARS) {
    transcriptText = transcriptText.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[...truncated]";
  }
  if (!transcriptText.trim()) {
    return NextResponse.json(
      { error: "Transcript has no text content." },
      { status: 400 }
    );
  }

  const ai = getAIProvider();

  // Role-aware prompt: fetch the user's profile and compose an
  // extended system prompt that includes domain vocabulary, the
  // role's preferred summary structure, action-item format, and
  // follow-up tone guidance.
  const storedProfile = await readUserProfile(user.userId);
  const role = findRoleProfile(storedProfile?.roleId);
  const systemPrompt =
    BASE_PROMPT +
    `\n\n## Role context\n` +
    `The reader is a ${role.label} in ${role.department} (${role.sector}).\n\n` +
    `${role.summaryTemplate}\n\n` +
    `Action-item guidance: ${role.actionItemFormat}\n\n` +
    `Domain vocabulary to recognize and spell correctly:\n` +
    role.vocabulary.slice(0, 40).join(", ");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const completion = await ai.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcriptText },
      ],
      { temperature: 0.3, maxTokens: 2000, signal: controller.signal }
    );
    clearTimeout(timeout);

    const rawMarkdown = completion.text;
    const extractedTasks = extractTasksFromLLM(rawMarkdown);
    const markdown = stripTasksBlock(rawMarkdown);
    const actionItems = parseActionItems(markdown);
    const keywords = parseKeywords(markdown);
    const sentiment = parseSentiment(markdown);
    const talkTime = parseTalkTime(markdown);

    events.emit({
      type: "summary.generated",
      transcriptId: null,
      userId: user.userId,
    });

    // Track chat-side energy for the Green ICT dashboard.
    void logChatUsage({
      userId: user.userId,
      timestamp: new Date().toISOString(),
      activity: "summary",
    });

    // Optional anonymised contribution to the org-intelligence log.
    // Gated on an explicit request header from the client — default off.
    if (req.headers.get("x-contribute-insights") === "true") {
      // Department is sourced **only** from the authenticated session
      // (Entra claim). Accepting an `x-department` header would let a
      // user spoof which bucket their anonymised meeting lands in —
      // low-impact (the aggregate is privacy-safe either way) but
      // undermines the legitimacy of the grouping.
      const department = user.department || "Unknown";
      const firstTs = entries[0]?.timestamp || "00:00:00";
      const lastTs = entries[entries.length - 1]?.timestamp || firstTs;
      const durationMinutes = approxDurationMinutes(firstTs, lastTs);
      const speakerCount = new Set(
        entries
          .map((e) => e.stableSpeakerId || e.rawSpeaker || e.speaker)
          .filter((s): s is string => !!s)
      ).size;
      void recordAnonymisedMeeting({
        timestamp: new Date().toISOString(),
        department,
        durationMinutes,
        topicKeywords:
          keywords.length > 0
            ? keywords.slice(0, 5).map((k) => k.toLowerCase())
            : extractKeywords(markdown),
        sentiment,
        actionItemCount: actionItems.length,
        speakerCount,
        languageUsed:
          (req.headers.get("x-language") || "").toLowerCase() || "unknown",
      });
    }

    // Persist extracted tasks into the per-user task log so they
    // show up on /tasks and the home-page checklist.
    for (const et of extractedTasks) {
      try {
        await upsertTask(user.userId, {
          id: newTaskId(),
          title: et.task,
          assignee: et.assignee,
          deadline: inferDeadline(et.deadline),
          priority: et.priority,
          transcriptTimestamp: et.timestamp,
          meetingTitle: body.meetingSubject || null,
          meetingDate: new Date().toISOString(),
          category: role.id,
          relatedKeywords: keywords.slice(0, 5),
        });
      } catch (err) {
        console.warn("[summarize] failed to persist extracted task", err);
      }
    }

    return NextResponse.json({
      markdown,
      actionItems,
      keywords,
      sentiment,
      talkTime,
      extractedTasks,
    } satisfies SummaryResponse);
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") {
      return NextResponse.json(
        { error: "Summary generation timed out. Try again with a shorter transcript." },
        { status: 504 }
      );
    }
    const error = err as { status?: number; message?: string };
    if (error.status === 404 || error.status === 400) {
      return NextResponse.json(
        {
          error:
            `Chat model "${chatDeployment()}" is not deployed on this Azure OpenAI resource. ` +
            "To enable AI summaries, deploy a GPT-4o chat model in Azure AI Foundry and set " +
            "AZURE_OPENAI_CHAT_DEPLOYMENT to its deployment name. Your transcript is saved and " +
            "can still be exported — a summary will be available once the chat model is deployed.",
          chatModelMissing: true,
        },
        { status: 501 }
      );
    }
    console.error("[summarize] upstream error:", error.message);
    return NextResponse.json(
      { error: "Summary generation failed." },
      { status: error.status && error.status < 500 ? error.status : 500 }
    );
  }
}

function parseActionItems(markdown: string): ActionItem[] {
  const items: ActionItem[] = [];
  // Match lines like: - [ ] Task — assigned to Speaker — due April 20
  // or:               - [ ] Task — assigned to Speaker
  const regex =
    /^-\s*\[[ x]?\]\s*(.+?)(?:\s*[—–-]\s*assigned\s+to\s+(.+?))?(?:\s*[—–-]\s*due\s+(.+?))?$/gim;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const task = (match[1] || "").trim().replace(/\s*[—–-]\s*$/, "");
    if (!task) continue;
    items.push({
      task,
      assignee: (match[2] || "").trim() || "Unassigned",
      dueDate: (match[3] || "").trim() || null,
      completed: false,
    });
  }
  return items;
}

function parseKeywords(markdown: string): string[] {
  const match = /##\s*Keywords\s*\n(.+)/i.exec(markdown);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && k.length < 100);
}

function parseSentiment(markdown: string): string {
  const match = /##\s*Sentiment\s*\n(.+)/i.exec(markdown);
  if (!match) return "Neutral";
  const raw = match[1].trim().toLowerCase();
  if (raw.includes("positive")) return "Positive";
  if (raw.includes("negative")) return "Negative";
  if (raw.includes("mixed")) return "Mixed";
  return "Neutral";
}

function parseTalkTime(markdown: string): Array<{ speaker: string; percent: number }> {
  const results: Array<{ speaker: string; percent: number }> = [];
  const section = markdown.match(/##\s*Talk Time\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
  if (!section) return results;
  const lines = section[1].split("\n");
  for (const line of lines) {
    const m = /^-\s*(.+?):\s*~?(\d+)%/.exec(line.trim());
    if (m) {
      results.push({ speaker: m[1].trim(), percent: parseInt(m[2], 10) });
    }
  }
  return results;
}

/**
 * Best-effort meeting duration from the first/last transcript timestamps.
 * Expects HH:MM:SS or MM:SS strings as produced by lib/audioUtils.formatElapsed.
 */
function approxDurationMinutes(firstTs: string, lastTs: string): number {
  const parse = (s: string): number => {
    const parts = s.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
  };
  const delta = Math.max(0, parse(lastTs) - parse(firstTs));
  return +(delta / 60).toFixed(1);
}
