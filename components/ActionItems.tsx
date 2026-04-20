"use client";

import { useCallback } from "react";
import { AlertCircle, CheckSquare, Square, User } from "lucide-react";
import { colorForSpeaker } from "@/lib/constants";
import { DISCLAIMER_SHORT } from "@/lib/disclaimer";

export type ActionItem = {
  task: string;
  assignee: string;
  dueDate: string | null;
  completed: boolean;
};

type Props = {
  items: ActionItem[];
  onChange?: (updated: ActionItem[]) => void;
  readOnly?: boolean;
};

export default function ActionItems({ items, onChange, readOnly }: Props) {
  const toggle = useCallback(
    (index: number) => {
      if (readOnly || !onChange) return;
      const next = items.map((it, i) =>
        i === index ? { ...it, completed: !it.completed } : it
      );
      onChange(next);
    },
    [items, onChange, readOnly]
  );

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div
        role="note"
        className="flex items-start gap-2 px-3 py-2 bg-off-white border border-border-gray rounded text-[11px] leading-snug text-mid-gray"
      >
        <AlertCircle size={12} className="shrink-0 mt-0.5 text-warning" aria-hidden />
        <span>AI-extracted from the transcript. {DISCLAIMER_SHORT}</span>
      </div>
      {items.map((item, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
            item.completed
              ? "bg-light-gray border-border-gray opacity-60"
              : "bg-white border-border-gray hover:border-itu-blue/30"
          }`}
        >
          <button
            onClick={() => toggle(i)}
            disabled={readOnly}
            className="shrink-0 mt-0.5 text-itu-blue hover:text-itu-blue-dark disabled:cursor-default"
            aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
          >
            {item.completed ? (
              <CheckSquare size={18} />
            ) : (
              <Square size={18} />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm leading-snug ${
                item.completed
                  ? "line-through text-mid-gray"
                  : "text-dark-navy"
              }`}
            >
              {item.task}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
                style={{
                  backgroundColor: colorForSpeaker(
                    item.assignee.toLowerCase().replace(/\s+/g, "_")
                  ),
                }}
              >
                <User size={10} />
                {item.assignee}
              </span>
              {item.dueDate && (
                <span className="text-xs text-mid-gray">
                  Due: {item.dueDate}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
