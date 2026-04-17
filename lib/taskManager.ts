/**
 * Task manager — auto-extracted action items from meetings, plus
 * manual tasks. One JSONL file per user.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  ensureWithinDir,
  logSecurityEvent,
  sanitizePathSegment,
} from "@/lib/security";

export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

export type Task = {
  id: string;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  title: string;
  description: string;
  assignee: string;
  deadline: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completedDate: string | null;
  transcriptTimestamp: string | null;
  relatedKeywords: string[];
  category: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
};

const BASE_DIR =
  process.env.DHVANI_DATA_DIR ||
  path.join(process.cwd(), "data", "transcripts");
const TASKS_DIR = path.join(BASE_DIR, "_tasks");

function fileFor(userId: string): string | null {
  const safe = sanitizePathSegment(userId);
  if (!safe) return null;
  const p = path.join(TASKS_DIR, `${safe}.jsonl`);
  if (!ensureWithinDir(p, TASKS_DIR)) {
    logSecurityEvent({
      type: "path_traversal",
      userId,
      details: "task log path escaped TASKS_DIR",
    });
    return null;
  }
  return p;
}

export function newTaskId(): string {
  return crypto.randomBytes(12).toString("hex");
}

export async function listTasks(userId: string): Promise<Task[]> {
  const p = fileFor(userId);
  if (!p) return [];
  try {
    const content = await fs.readFile(p, "utf8");
    const out: Task[] = [];
    // Each line is the latest-write for its id, collapsed via map.
    const byId = new Map<string, Task>();
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t) as Task;
        byId.set(rec.id, rec);
      } catch {
        /* skip malformed */
      }
    }
    for (const v of byId.values()) out.push(v);
    return out.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function writeTask(userId: string, task: Task): Promise<void> {
  const p = fileFor(userId);
  if (!p) throw new Error("Invalid user id");
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.appendFile(p, JSON.stringify(task) + "\n", "utf8");
}

export async function upsertTask(
  userId: string,
  patch: Partial<Task> & { id?: string }
): Promise<Task> {
  const now = new Date().toISOString();
  const existing = patch.id
    ? (await listTasks(userId)).find((t) => t.id === patch.id)
    : undefined;
  const task: Task = {
    id: patch.id || newTaskId(),
    meetingId: patch.meetingId ?? existing?.meetingId ?? null,
    meetingTitle: patch.meetingTitle ?? existing?.meetingTitle ?? null,
    meetingDate: patch.meetingDate ?? existing?.meetingDate ?? null,
    title: (patch.title ?? existing?.title ?? "").slice(0, 500),
    description: (patch.description ?? existing?.description ?? "").slice(0, 2000),
    assignee: (patch.assignee ?? existing?.assignee ?? "Unassigned").slice(0, 200),
    deadline: patch.deadline ?? existing?.deadline ?? null,
    priority: patch.priority ?? existing?.priority ?? "medium",
    status: patch.status ?? existing?.status ?? "pending",
    completedDate:
      patch.status === "completed"
        ? patch.completedDate ?? now
        : patch.status
        ? null // any other explicit status clears completion
        : existing?.completedDate ?? null,
    transcriptTimestamp:
      patch.transcriptTimestamp ?? existing?.transcriptTimestamp ?? null,
    relatedKeywords: patch.relatedKeywords ?? existing?.relatedKeywords ?? [],
    category: patch.category ?? existing?.category ?? "general",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    notes: (patch.notes ?? existing?.notes ?? "").slice(0, 5000),
  };
  await writeTask(userId, task);
  return task;
}

export async function deleteTask(
  userId: string,
  id: string
): Promise<boolean> {
  const current = await listTasks(userId);
  if (!current.some((t) => t.id === id)) return false;
  const tombstone: Task = {
    ...(current.find((t) => t.id === id) as Task),
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  };
  // Tombstone approach: append a cancelled record. If we want hard
  // delete later, add a separate compactor.
  await writeTask(userId, tombstone);
  return true;
}

/**
 * Resolve relative deadline phrases ("next week", "ASAP") into ISO
 * dates. Called by the AI-task-extraction code in /api/summarize
 * when the model returns a descriptive deadline instead of an ISO.
 */
export function inferDeadline(
  raw: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Already looks ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const add = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (/\b(asap|urgent|immediately|today)\b/.test(trimmed)) return add(0);
  if (/\btomorrow\b/.test(trimmed)) return add(1);
  if (/\bnext week\b/.test(trimmed)) {
    const d = new Date(now);
    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
    return add(daysUntilMonday);
  }
  if (/\bend of (the )?week\b/.test(trimmed)) {
    const d = new Date(now);
    const daysUntilFriday = (5 - d.getDay() + 7) % 7;
    return add(daysUntilFriday || 7);
  }
  if (/\bend of (the )?month\b/.test(trimmed)) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }
  if (/\bfollow[- ]up\b/.test(trimmed)) return add(7);
  // Give up — return null so the UI shows "no deadline".
  return null;
}

/**
 * Very light LLM-output parser. Looks for the `---TASKS---` sentinel
 * and JSON array the /api/summarize system prompt asks for. Returns
 * an empty array on any failure — tasks are a nice-to-have and
 * shouldn't fail the whole summary.
 */
export type ExtractedTask = {
  task: string;
  assignee: string;
  deadline: string | null;
  priority: TaskPriority;
  timestamp: string | null;
};

export function extractTasksFromLLM(raw: string): ExtractedTask[] {
  const idx = raw.indexOf("---TASKS---");
  if (idx === -1) return [];
  const tail = raw.slice(idx + "---TASKS---".length).trim();
  // Model may wrap in ```json blocks.
  const cleaned = tail.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    const priorities: TaskPriority[] = ["critical", "high", "medium", "low"];
    return arr
      .filter((x) => x && typeof x.task === "string")
      .map((x) => ({
        task: String(x.task).slice(0, 500),
        assignee: String(x.assignee || "Unassigned").slice(0, 200),
        deadline: x.deadline ? String(x.deadline) : null,
        priority: priorities.includes(x.priority) ? x.priority : "medium",
        timestamp: x.timestamp ? String(x.timestamp) : null,
      }));
  } catch {
    return [];
  }
}

/** Strip the `---TASKS---` block from the summary before returning to the client. */
export function stripTasksBlock(raw: string): string {
  const idx = raw.indexOf("---TASKS---");
  return idx === -1 ? raw : raw.slice(0, idx).trimEnd();
}
