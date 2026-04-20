import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import { createChatOpenAIClient, chatDeployment } from "@/lib/openai";
import { listTranscripts, getTranscript } from "@/lib/transcriptStorage";
import { checkChatRate } from "@/lib/rateLimiter";
import { logSecurityEvent } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are Dhvani, an AI assistant that answers questions about meeting transcripts. Always cite the specific meeting name, date, and speaker when answering. If the answer isn't in the transcripts, say so clearly. Be concise. Use bullet points for lists.

When citing information, format citations as:
[Meeting: "title" | Date: YYYY-MM-DD | Speaker: name]`;

const MAX_CONTEXT_CHARS = 100_000;

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
      details: `ask hourly limit — retry in ${rate.retryAfterSeconds}s`,
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
    question?: string;
    transcriptIds?: string[];
    scope?: "single" | "all";
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const question = (body.question || "").trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "Question too long (max 2000 chars)." }, { status: 400 });
  }

  let contextText = "";
  const meetingsMeta: Array<{ title: string; date: string }> = [];

  try {
    if (body.scope === "single" && body.transcriptIds?.length) {
      for (const id of body.transcriptIds.slice(0, 5)) {
        const t = await getTranscript(user.userId, id);
        if (!t) continue;
        meetingsMeta.push({ title: t.title, date: t.startedAt.slice(0, 10) });
        contextText += formatTranscript(t.title, t.startedAt, t.entries, t.speakerNames);
        if (contextText.length > MAX_CONTEXT_CHARS) break;
      }
    } else {
      const all = await listTranscripts(user.userId);
      for (const meta of all.slice(0, 50)) {
        const t = await getTranscript(user.userId, meta.id);
        if (!t) continue;
        meetingsMeta.push({ title: t.title, date: t.startedAt.slice(0, 10) });
        contextText += formatTranscript(t.title, t.startedAt, t.entries, t.speakerNames);
        if (contextText.length > MAX_CONTEXT_CHARS) break;
      }
    }
  } catch {
    return NextResponse.json({ error: "Failed to load transcripts." }, { status: 500 });
  }

  if (!contextText.trim()) {
    return NextResponse.json({
      answer: "You don't have any saved transcripts yet. Save a meeting transcript first, then ask me questions about it.",
      citations: [],
    });
  }

  if (contextText.length > MAX_CONTEXT_CHARS) {
    contextText = contextText.slice(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
  }

  let openai;
  try {
    openai = createChatOpenAIClient();
  } catch {
    return NextResponse.json({ error: "AI service is misconfigured." }, { status: 500 });
  }

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Here are the meeting transcripts:\n\n${contextText}` },
  ];

  if (body.history?.length) {
    for (const h of body.history.slice(-10)) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: h.content.slice(0, 4000) });
      }
    }
  }

  messages.push({ role: "user", content: question });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const completion = await openai.chat.completions.create(
      {
        model: chatDeployment(),
        messages,
        temperature: 0.3,
        max_tokens: 2000,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const answer = completion.choices[0]?.message?.content || "";
    const citations = parseCitations(answer, meetingsMeta);

    return NextResponse.json({ answer, citations });
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") {
      return NextResponse.json({ error: "Request timed out." }, { status: 504 });
    }
    const error = err as { status?: number; message?: string };
    console.error("[ask] upstream error:", error.message);
    return NextResponse.json(
      { error: "Failed to get answer." },
      { status: error.status && error.status < 500 ? error.status : 500 }
    );
  }
}

function formatTranscript(
  title: string,
  startedAt: string,
  entries: Array<{
    text: string;
    speaker?: string;
    rawSpeaker?: string;
    stableSpeakerId?: string;
    timestamp: string;
  }>,
  speakerNames?: Record<string, string>
): string {
  const date = startedAt.slice(0, 10);
  let out = `\n--- Meeting: "${title}" | Date: ${date} ---\n`;
  for (const e of entries) {
    const id = e.stableSpeakerId || e.rawSpeaker;
    const speaker = (id && speakerNames?.[id]) || e.speaker || "Unknown";
    out += `[${e.timestamp}] ${speaker}: ${e.text}\n`;
  }
  return out;
}

function parseCitations(
  answer: string,
  meta: Array<{ title: string; date: string }>
): Array<{ meetingTitle: string; date: string; speaker: string; quote: string }> {
  const citations: Array<{ meetingTitle: string; date: string; speaker: string; quote: string }> = [];
  const regex = /\[Meeting:\s*"([^"]+)"\s*\|\s*Date:\s*([^\]|]+?)(?:\s*\|\s*Speaker:\s*([^\]]+?))?\]/g;
  let match;
  while ((match = regex.exec(answer)) !== null) {
    citations.push({
      meetingTitle: match[1].trim(),
      date: match[2].trim(),
      speaker: (match[3] || "").trim(),
      quote: "",
    });
  }
  if (citations.length === 0 && meta.length === 1) {
    citations.push({
      meetingTitle: meta[0].title,
      date: meta[0].date,
      speaker: "",
      quote: "",
    });
  }
  return citations;
}
