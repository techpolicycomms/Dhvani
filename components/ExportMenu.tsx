"use client";

import { useState } from "react";
import {
  buildFilename,
  downloadText,
  toJson,
  toSrt,
  toTxt,
  type SpeakerResolver,
} from "@/lib/exportUtils";
import type { TranscriptEntry } from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  resolveSpeaker?: SpeakerResolver;
};

/**
 * Export menu — copy to clipboard, or download .txt, .srt, .json.
 * Disabled when the transcript is empty.
 */
export function ExportMenu({ transcript, resolveSpeaker }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const disabled = transcript.length === 0;

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(toTxt(transcript, resolveSpeaker));
      setStatus("Copied to clipboard");
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus("Copy failed");
      setTimeout(() => setStatus(null), 1500);
    }
  };

  const doDownload = (kind: "txt" | "srt" | "json") => {
    const file = buildFilename(kind);
    if (kind === "txt") downloadText(toTxt(transcript, resolveSpeaker), file);
    if (kind === "srt") downloadText(toSrt(transcript, resolveSpeaker), file);
    if (kind === "json")
      downloadText(toJson(transcript, resolveSpeaker), file, "application/json");
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-4 py-2 rounded-lg bg-navy-light border border-white/10 hover:bg-navy-light/80 text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Export ▾
      </button>
      {open && !disabled && (
        <div className="absolute right-0 bottom-full mb-2 w-48 bg-navy-light border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
          <MenuItem onClick={doCopy}>Copy All (clipboard)</MenuItem>
          <MenuItem onClick={() => doDownload("txt")}>Download .txt</MenuItem>
          <MenuItem onClick={() => doDownload("srt")}>Download .srt</MenuItem>
          <MenuItem onClick={() => doDownload("json")}>Download .json</MenuItem>
        </div>
      )}
      {status && (
        <span className="absolute right-0 -top-6 text-xs text-teal whitespace-nowrap">
          {status}
        </span>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2 text-sm text-white/90 hover:bg-teal/20"
    >
      {children}
    </button>
  );
}
