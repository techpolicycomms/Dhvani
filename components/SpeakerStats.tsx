"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { colorForSpeaker, type TranscriptEntry } from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  speakerNames?: Record<string, string>;
  talkTime?: Array<{ speaker: string; percent: number }>;
};

export default function SpeakerStats({ transcript, speakerNames, talkTime }: Props) {
  const stats = useMemo(() => {
    if (talkTime && talkTime.length > 0) {
      return talkTime.map((t) => ({
        speaker: t.speaker,
        rawSpeaker: t.speaker.toLowerCase().replace(/\s+/g, "_"),
        percent: t.percent,
        wordCount: 0,
        segments: 0,
      }));
    }

    const byRaw: Record<string, { wordCount: number; segments: number }> = {};
    let totalWords = 0;
    for (const e of transcript) {
      const key = e.rawSpeaker || "unknown";
      if (!byRaw[key]) byRaw[key] = { wordCount: 0, segments: 0 };
      const words = e.text.split(/\s+/).filter(Boolean).length;
      byRaw[key].wordCount += words;
      byRaw[key].segments += 1;
      totalWords += words;
    }

    return Object.entries(byRaw)
      .map(([raw, data]) => ({
        speaker: (speakerNames?.[raw]) || raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        rawSpeaker: raw,
        percent: totalWords > 0 ? Math.round((data.wordCount / totalWords) * 100) : 0,
        wordCount: data.wordCount,
        segments: data.segments,
      }))
      .sort((a, b) => b.percent - a.percent);
  }, [transcript, speakerNames, talkTime]);

  if (stats.length === 0) return null;

  const totalWords = transcript.reduce((sum, e) => sum + e.text.split(/\s+/).filter(Boolean).length, 0);

  return (
    <div className="border border-border-gray rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-gray bg-off-white">
        <BarChart3 size={16} className="text-itu-blue" />
        <span className="text-sm font-semibold text-dark-navy">Speaker Statistics</span>
        <span className="text-xs text-mid-gray ml-auto">{totalWords.toLocaleString()} total words</span>
      </div>
      <div className="p-4 space-y-3">
        {stats.map((s) => (
          <div key={s.rawSpeaker} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-dark-navy">{s.speaker}</span>
              <span className="text-xs text-mid-gray">{s.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-light-gray overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, s.percent)}%`,
                  backgroundColor: colorForSpeaker(s.rawSpeaker),
                }}
              />
            </div>
            {s.wordCount > 0 && (
              <div className="text-xs text-mid-gray">
                {s.wordCount} words, {s.segments} segments
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
