import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { chatDeployment } from "@/lib/openai";
import { getAIProvider } from "@/lib/providers";
import { events } from "@/lib/events";
import type { TranscriptEntry } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an expert meeting assistant. Given a transcript with speaker labels, generate a structured meeting summary. Format your response EXACTLY as follows:

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

Be concise. Use the speaker names as provided. If no due date was mentioned for an action item, omit the due field. If no clear decisions were made, omit that section. If only one speaker is present, adjust accordingly.`;

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
    const speaker =
      (e.rawSpeaker && speakerNames[e.rawSpeaker]) ||
      e.speaker ||
      e.rawSpeaker ||
      "Unknown";
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const completion = await ai.chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcriptText },
      ],
      { temperature: 0.3, maxTokens: 2000, signal: controller.signal }
    );
    clearTimeout(timeout);

    const markdown = completion.text;
    const actionItems = parseActionItems(markdown);
    const keywords = parseKeywords(markdown);
    const sentiment = parseSentiment(markdown);
    const talkTime = parseTalkTime(markdown);

    events.emit({
      type: "summary.generated",
      transcriptId: null,
      userId: user.userId,
    });

    return NextResponse.json({ markdown, actionItems, keywords, sentiment, talkTime } satisfies SummaryResponse);
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
    return NextResponse.json(
      { error: error.message || "Summary generation failed." },
      { status: error.status || 500 }
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
