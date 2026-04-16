import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { createChatOpenAIClient, chatDeployment } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM_PROMPT = `Write a professional follow-up email for this meeting. Include: brief summary, action items with assignees, next steps, and any deadlines mentioned. Tone: professional but warm. Address it to the meeting attendees. Format as plain text email (not HTML).`;

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    summary?: string;
    actionItems?: Array<{ task: string; assignee: string; dueDate?: string | null }>;
    attendees?: string[];
    meetingSubject?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.summary) {
    return NextResponse.json({ error: "Summary is required." }, { status: 400 });
  }

  const context = [
    body.meetingSubject ? `Meeting: ${body.meetingSubject}` : "",
    body.attendees?.length ? `Attendees: ${body.attendees.join(", ")}` : "",
    `Summary:\n${body.summary}`,
    body.actionItems?.length
      ? `Action Items:\n${body.actionItems.map((a) => `- ${a.task} (${a.assignee})${a.dueDate ? ` due ${a.dueDate}` : ""}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let openai;
  try {
    openai = createChatOpenAIClient();
  } catch {
    return NextResponse.json({ error: "AI service is misconfigured." }, { status: 500 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const completion = await openai.chat.completions.create(
      {
        model: chatDeployment(),
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: context },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const email = completion.choices[0]?.message?.content || "";
    const subject = body.meetingSubject
      ? `Follow-up: ${body.meetingSubject}`
      : "Meeting Follow-up";

    return NextResponse.json({ email, subject });
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") {
      return NextResponse.json({ error: "Request timed out." }, { status: 504 });
    }
    return NextResponse.json(
      { error: (err as { message?: string }).message || "Failed to generate email." },
      { status: 500 }
    );
  }
}
