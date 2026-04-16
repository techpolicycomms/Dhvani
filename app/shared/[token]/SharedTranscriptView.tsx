"use client";

import { useState } from "react";
import { Clock, Copy, Check, Download, FileText, Users } from "lucide-react";
import type { TranscriptEntry } from "@/lib/constants";
import type { ActionItem } from "@/components/ActionItems";
import ActionItems from "@/components/ActionItems";

type Props = {
  transcript: {
    title: string;
    startedAt: string;
    endedAt: string;
    durationMinutes: number;
    entries: TranscriptEntry[];
    speakerNames?: Record<string, string>;
    summary?: string;
    actionItems?: ActionItem[];
    meeting?: { subject: string; organizer?: string; platform?: string };
  };
};

export default function SharedTranscriptView({ transcript }: Props) {
  const [copied, setCopied] = useState(false);
  const t = transcript;

  const resolveSpeaker = (rawSpeaker?: string) => {
    if (!rawSpeaker) return undefined;
    return t.speakerNames?.[rawSpeaker] || rawSpeaker;
  };

  const exportTxt = () => {
    const lines = t.entries.map((e) => {
      const speaker = resolveSpeaker(e.rawSpeaker) || e.speaker || "";
      return `[${e.timestamp}]${speaker ? ` ${speaker}:` : ""} ${e.text}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copyAll = async () => {
    const lines = t.entries.map((e) => {
      const speaker = resolveSpeaker(e.rawSpeaker) || e.speaker || "";
      return `[${e.timestamp}]${speaker ? ` ${speaker}:` : ""} ${e.text}`;
    });
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const date = new Date(t.startedAt);
  const speakers = new Set<string>();
  t.entries.forEach((e) => {
    const s = resolveSpeaker(e.rawSpeaker) || e.speaker;
    if (s) speakers.add(s);
  });

  return (
    <main className="min-h-screen bg-off-white pt-[3px]">
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-itu-blue z-50" aria-hidden="true" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white border border-border-gray rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-border-gray">
            <h1 className="text-xl font-bold text-dark-navy mb-2">{t.title}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mid-gray">
              <span className="inline-flex items-center gap-1">
                <Clock size={14} />
                {date.toLocaleDateString(undefined, { dateStyle: "long" })}
                {" at "}
                {date.toLocaleTimeString(undefined, { timeStyle: "short" })}
              </span>
              <span>{Math.round(t.durationMinutes)} min</span>
              <span className="inline-flex items-center gap-1">
                <Users size={14} />
                {speakers.size} speaker{speakers.size !== 1 ? "s" : ""}
              </span>
              {t.meeting?.platform && (
                <span className="text-xs px-2 py-0.5 rounded bg-itu-blue-pale text-itu-blue-dark font-medium">
                  {t.meeting.platform}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-2 px-6 py-3 border-b border-border-gray bg-off-white">
            <button onClick={copyAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border-gray rounded bg-white hover:bg-light-gray text-dark-navy">
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy all"}
            </button>
            <button onClick={exportTxt} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border-gray rounded bg-white hover:bg-light-gray text-dark-navy">
              <Download size={12} />
              Download .txt
            </button>
          </div>

          {t.summary && (
            <div className="px-6 py-5 border-b border-border-gray">
              <h2 className="text-sm font-semibold text-dark-navy mb-3 flex items-center gap-2">
                <FileText size={14} className="text-itu-blue" />
                Meeting Summary
              </h2>
              <div className="text-sm text-dark-gray leading-relaxed whitespace-pre-wrap">
                {t.summary}
              </div>
              {t.actionItems && t.actionItems.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                    Action Items ({t.actionItems.length})
                  </h3>
                  <ActionItems items={t.actionItems} readOnly />
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-5">
            <h2 className="text-sm font-semibold text-dark-navy mb-3">
              Transcript ({t.entries.length} entries)
            </h2>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {t.entries.map((e) => {
                const speaker = resolveSpeaker(e.rawSpeaker) || e.speaker;
                return (
                  <div key={e.id} className="flex gap-3 text-sm py-1">
                    <span className="text-xs text-mid-gray font-mono shrink-0 pt-0.5 w-16 text-right">
                      {e.timestamp}
                    </span>
                    <div className="min-w-0">
                      {speaker && (
                        <span className="font-semibold text-dark-navy mr-1.5">
                          {speaker}:
                        </span>
                      )}
                      <span className="text-dark-gray">{e.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-mid-gray">
          Powered by Dhvani — ITU Innovation Hub
        </div>
      </div>
    </main>
  );
}
