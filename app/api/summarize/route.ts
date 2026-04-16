import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { createOpenAIClient, chatDeployment } from "@/lib/openai";
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

  let openai;
  try {
    openai = createOpenAIClient();
  } catch {
    return NextResponse.json(
      { error: "AI service is misconfigured." },
      { status: 500 }
    );
  }

  try {
    const completion = await openai.chat.completions.create({
      model: chatDeployment(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcriptText },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const markdown = completion.choices[0]?.message?.content || "";
    const actionItems = parseActionItems(markdown);

    return NextResponse.json({ markdown, actionItems } satisfies SummaryResponse);
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status === 404) {
      return NextResponse.json(
        {
          error: `Chat model "${chatDeployment()}" not found on your Azure OpenAI resource. Deploy a GPT-4o model and set AZURE_OPENAI_CHAT_DEPLOYMENT.`,
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
