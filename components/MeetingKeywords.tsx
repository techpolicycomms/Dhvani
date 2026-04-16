"use client";

import { Tag } from "lucide-react";

type Props = {
  keywords: string[];
  onSearch?: (keyword: string) => void;
};

export default function MeetingKeywords({ keywords, onSearch }: Props) {
  if (keywords.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tag size={14} className="text-mid-gray shrink-0" />
      {keywords.map((kw) => (
        <button
          key={kw}
          onClick={() => onSearch?.(kw)}
          className="text-xs px-2.5 py-1 rounded-full bg-itu-blue-pale text-itu-blue-dark font-medium hover:bg-itu-blue/20 transition-colors"
        >
          {kw}
        </button>
      ))}
    </div>
  );
}
