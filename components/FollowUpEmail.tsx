"use client";

import { useCallback, useState } from "react";
import { Copy, Check, Loader2, Mail } from "lucide-react";
import type { ActionItem } from "./ActionItems";

type Props = {
  summary: string;
  actionItems: ActionItem[];
  meetingSubject?: string;
  attendees?: string[];
};

export default function FollowUpEmail({ summary, actionItems, meetingSubject, attendees }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ summary, actionItems, meetingSubject, attendees }),
      });
      if (!res.ok) throw new Error("Failed to generate");
      const body = await res.json();
      setEmail(body.email);
      setSubject(body.subject);
      setState("done");
    } catch {
      setState("idle");
    }
  }, [summary, actionItems, meetingSubject, attendees]);

  const copy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openMail = () => {
    const s = encodeURIComponent(subject);
    const b = encodeURIComponent(email);
    window.open(`mailto:?subject=${s}&body=${b}`, "_blank");
  };

  if (state === "idle") {
    return (
      <button
        onClick={generate}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-itu-blue text-itu-blue rounded-lg hover:bg-itu-blue-pale transition-colors"
      >
        <Mail size={12} />
        Generate Follow-up Email
      </button>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-mid-gray">
        <Loader2 size={14} className="animate-spin" />
        Generating follow-up email...
      </div>
    );
  }

  return (
    <div className="border border-border-gray rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-off-white border-b border-border-gray">
        <span className="text-xs font-semibold text-dark-navy">Follow-up Email</span>
        <div className="flex gap-1">
          <button onClick={copy} className="p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray" title="Copy">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button onClick={openMail} className="p-1.5 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray" title="Open in mail">
            <Mail size={14} />
          </button>
        </div>
      </div>
      <textarea
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full p-3 text-sm text-dark-navy bg-white border-none resize-y min-h-[200px] focus:outline-none"
      />
    </div>
  );
}
