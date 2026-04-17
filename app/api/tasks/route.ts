import { NextRequest, NextResponse } from "next/server";
import { getActiveUser } from "@/lib/auth";
import {
  deleteTask,
  listTasks,
  upsertTask,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/taskManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tasks = await listTasks(user.userId);
  const params = req.nextUrl.searchParams;
  let out = tasks;
  const status = params.get("status") as TaskStatus | null;
  if (status) out = out.filter((t) => t.status === status);
  const date = params.get("date");
  if (date) out = out.filter((t) => (t.deadline || "").startsWith(date));
  const upcoming = params.get("upcoming");
  if (upcoming) {
    const days = Math.max(1, Math.min(90, Number(upcoming) || 7));
    const cutoff = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    out = out.filter(
      (t) => t.deadline && t.deadline >= today && t.deadline <= cutoff
    );
  }
  const search = params.get("search")?.toLowerCase();
  if (search) {
    out = out.filter(
      (t) =>
        t.title.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        t.assignee.toLowerCase().includes(search)
    );
  }
  return NextResponse.json({ tasks: out });
}

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    id?: string;
    title: string;
    description?: string;
    assignee?: string;
    deadline?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    meetingId?: string | null;
    meetingTitle?: string | null;
    meetingDate?: string | null;
    transcriptTimestamp?: string | null;
    relatedKeywords?: string[];
    category?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json(
      { error: "title is required." },
      { status: 400 }
    );
  }
  const task = await upsertTask(user.userId, body);
  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteTask(user.userId, id);
  return NextResponse.json({ ok });
}
