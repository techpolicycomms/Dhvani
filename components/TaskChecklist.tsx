"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import type { Task, TaskPriority } from "@/lib/taskManager";

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  critical: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#6B7280",
};

type Props = {
  /** Cap the list length — used for the home-page compact view. */
  limit?: number;
  /** Hide completed tasks. */
  hideCompleted?: boolean;
};

export function TaskChecklist({ limit, hideCompleted = false }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const reload = useCallback(async () => {
    const params = new URLSearchParams();
    if (hideCompleted) params.set("status", "pending");
    try {
      const res = await fetch(`/api/tasks?${params}`, { credentials: "include" });
      if (!res.ok) return;
      const body = (await res.json()) as { tasks: Task[] };
      setTasks(body.tasks);
    } catch {
      /* ignore */
    }
  }, [hideCompleted]);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  const toggle = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    // Optimistic update.
    setTasks((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, status: next } : x))
    );
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: t.id, status: next }),
    });
    reload();
  };

  const remove = async (t: Task) => {
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks?id=${encodeURIComponent(t.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    reload();
  };

  const addNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(false);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title: newTitle.trim(), priority: "medium" }),
    });
    setNewTitle("");
    reload();
  };

  if (loading) {
    return <div className="text-xs text-mid-gray">Loading tasks…</div>;
  }

  const display = limit ? tasks.slice(0, limit) : tasks;
  const remainingCount = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled"
  ).length;
  const doneCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider">
          Mission checklist
        </div>
        <div className="text-[11px] text-mid-gray tabular-nums">
          {doneCount}/{tasks.length} complete · {remainingCount} open
        </div>
      </div>

      {display.length === 0 ? (
        <div className="text-xs text-mid-gray italic py-3">
          No tasks yet. Generate a summary or add one below — tasks extracted from meetings land here automatically.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {display.map((t) => {
            const done = t.status === "completed";
            const cancelled = t.status === "cancelled";
            if (cancelled) return null;
            return (
              <li
                key={t.id}
                className="flex items-start gap-2 rounded border border-border-gray bg-white px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="mt-0.5 text-itu-blue hover:text-itu-blue-dark shrink-0"
                  aria-label={done ? "Mark as pending" : "Mark as complete"}
                >
                  {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className={[
                      "text-sm text-dark-navy",
                      done ? "line-through text-mid-gray" : "",
                    ].join(" ")}
                  >
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-mid-gray">
                    <span style={{ color: PRIORITY_COLOR[t.priority] }}>
                      ● {t.priority}
                    </span>
                    <span>→ {t.assignee || "Unassigned"}</span>
                    {t.deadline && <span>📅 {t.deadline}</span>}
                    {t.meetingTitle && (
                      <span className="truncate max-w-[180px]" title={t.meetingTitle}>
                        📡 {t.meetingTitle}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(t)}
                  className="text-mid-gray/50 hover:text-error shrink-0"
                  aria-label="Delete task"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form onSubmit={addNew} className="flex gap-2">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task…"
            className="flex-1 bg-white border border-border-gray rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-itu-blue text-white text-xs font-semibold hover:bg-itu-blue-dark"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewTitle("");
            }}
            className="px-3 py-1 text-xs text-mid-gray hover:text-dark-navy"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 text-xs text-itu-blue hover:text-itu-blue-dark"
        >
          <Plus size={12} /> Add task
        </button>
      )}
    </div>
  );
}
