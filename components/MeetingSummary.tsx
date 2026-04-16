"use client";

import { useCallback, useState } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Mail,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ActionItems, { type ActionItem } from "./ActionItems";
import type { TranscriptEntry } from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  speakerNames: Record<string, string>;
  meetingSubject?: string;
  /** Pre-loaded summary (from saved transcript). */
  initialSummary?: string;
  initialActionItems?: ActionItem[];
  /** Called when a new summary is generated, so parent can persist it. */
  onSummaryGenerated?: (summary: string, items: ActionItem[]) => void;
  /** Called when action items change (checkbox toggle). */
  onActionItemsChange?: (items: ActionItem[]) => void;
};

type State = "idle" | "loading" | "done" | "error";

export default function MeetingSummary({
  transcript,
  speakerNames,
  meetingSubject,
  initialSummary,
  initialActionItems,
  onSummaryGenerated,
  onActionItemsChange,
}: Props) {
  const [state, setState] = useState<State>(initialSummary ? "done" : "idle");
  const [summary, setSummary] = useState(initialSummary || "");
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    initialActionItems || []
  );
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const generate = useCallback(async () => {
    if (transcript.length === 0) return;
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          transcript,
          meetingSubject,
          speakerNames,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const body = await res.json();
      setSummary(body.markdown || "");
      setActionItems(body.actionItems || []);
      setState("done");
      onSummaryGenerated?.(body.markdown || "", body.actionItems || []);
    } catch (err) {
      setError((err as Error).message || "Summary generation failed.");
      setState("error");
    }
  }, [transcript, meetingSubject, speakerNames, onSummaryGenerated]);

  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  }, [summary]);

  const shareViaEmail = useCallback(() => {
    const subject = encodeURIComponent(
      meetingSubject
        ? `Meeting Summary: ${meetingSubject}`
        : "Meeting Summary — Dhvani"
    );
    const body = encodeURIComponent(summary);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }, [summary, meetingSubject]);

  const handleActionItemsChange = useCallback(
    (updated: ActionItem[]) => {
      setActionItems(updated);
      onActionItemsChange?.(updated);
    },
    [onActionItemsChange]
  );

  // Idle state: show generate button.
  if (state === "idle") {
    return (
      <div className="bg-itu-blue-pale/50 border border-itu-blue/20 rounded-xl p-6 text-center">
        <Sparkles className="mx-auto mb-3 text-itu-blue" size={32} />
        <h3 className="text-base font-semibold text-dark-navy mb-1">
          AI Meeting Summary
        </h3>
        <p className="text-sm text-mid-gray mb-4">
          Generate a structured summary with key decisions, action items, and
          participant contributions.
        </p>
        <button
          onClick={generate}
          disabled={transcript.length === 0}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} className="inline -mt-0.5 mr-1.5" />
          Generate Summary
        </button>
      </div>
    );
  }

  // Loading state.
  if (state === "loading") {
    return (
      <div className="bg-itu-blue-pale/50 border border-itu-blue/20 rounded-xl p-8 text-center">
        <Loader2
          className="mx-auto mb-3 text-itu-blue animate-spin"
          size={32}
        />
        <p className="text-sm font-medium text-dark-navy">
          Analyzing your meeting...
        </p>
        <p className="text-xs text-mid-gray mt-1">
          This may take 10–20 seconds for longer meetings.
        </p>
      </div>
    );
  }

  // Error state.
  if (state === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5">
        <p className="text-sm text-red-800 mb-3">{error}</p>
        <button
          onClick={generate}
          className="px-4 py-1.5 text-xs font-semibold text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark"
        >
          Try again
        </button>
      </div>
    );
  }

  // Done — render the summary.
  return (
    <div className="bg-white border border-border-gray rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-gray bg-off-white">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-dark-navy hover:text-itu-blue transition-colors"
        >
          <Sparkles size={16} className="text-itu-blue" />
          AI Summary
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyToClipboard}
            className="p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray transition-colors"
            title="Copy summary"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button
            onClick={shareViaEmail}
            className="p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray transition-colors"
            title="Share via email"
          >
            <Mail size={15} />
          </button>
          <button
            onClick={generate}
            className="p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray transition-colors"
            title="Regenerate summary"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-border-gray">
          {/* Summary markdown — rendered as simple formatted text */}
          <div className="px-4 py-4">
            <SummaryMarkdown text={summary} />
          </div>

          {/* Action items */}
          {actionItems.length > 0 && (
            <div className="px-4 py-4">
              <h4 className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-3">
                Action Items ({actionItems.length})
              </h4>
              <ActionItems
                items={actionItems}
                onChange={handleActionItemsChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    key++;
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={key}
          className="text-sm font-bold text-dark-navy mt-4 mb-1.5 first:mt-0"
        >
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith("- [ ] ") || line.startsWith("- [x] ")) {
      // Skip action items — rendered separately by ActionItems component.
      continue;
    } else if (line.startsWith("- ")) {
      elements.push(
        <li key={key} className="text-sm text-dark-gray ml-4 mb-0.5 list-disc">
          {line.slice(2)}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key} className="h-1.5" />);
    } else {
      elements.push(
        <p key={key} className="text-sm text-dark-gray leading-relaxed">
          {line}
        </p>
      );
    }
  }

  return <div>{elements}</div>;
}
