"use client";

import { useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import {
  buildFilename,
  downloadText,
  toJson,
  toMarkdown,
  toSrt,
  toTxt,
  type SpeakerResolver,
} from "@/lib/exportUtils";
import { exportFilename, generateDocx } from "@/lib/docxExport";
import { useMode } from "@/hooks/useMode";
import type { TranscriptEntry } from "@/lib/constants";

type Props = {
  transcript: TranscriptEntry[];
  resolveSpeaker?: SpeakerResolver;
  /** Optional metadata used by the .docx export. */
  title?: string;
  startedAt?: string;
  durationMin?: number;
  recapMarkdown?: string;
  actionItems?: string[];
};

/**
 * Export menu — copy to clipboard, or download .txt, .srt, .json.
 * Disabled when the transcript is empty.
 */
export function ExportMenu({
  transcript,
  resolveSpeaker,
  title,
  startedAt,
  durationMin,
  recapMarkdown,
  actionItems,
}: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { mode } = useMode();

  const disabled = transcript.length === 0;

  const doDownloadDocx = async () => {
    try {
      const bytes = await generateDocx(
        {
          transcript,
          resolveSpeaker,
          title,
          startedAt,
          durationMin,
          recapMarkdown,
          actionItems,
        },
        mode
      );
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFilename(mode, "docx", title);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Downloaded .docx");
      setTimeout(() => setStatus(null), 1500);
    } catch (err) {
      console.warn("[ExportMenu] docx generation failed", err);
      setStatus("Download failed");
      setTimeout(() => setStatus(null), 1500);
    }
    setOpen(false);
  };

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

  const doCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(transcript, resolveSpeaker));
      setStatus("Copied as Markdown");
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus("Copy failed");
      setTimeout(() => setStatus(null), 1500);
    }
    setOpen(false);
  };

  const doDownload = (kind: "txt" | "srt" | "json" | "md") => {
    const file = buildFilename(kind, { mode, title });
    if (kind === "txt") downloadText(toTxt(transcript, resolveSpeaker), file);
    if (kind === "srt") downloadText(toSrt(transcript, resolveSpeaker), file);
    if (kind === "json")
      downloadText(toJson(transcript, resolveSpeaker), file, "application/json");
    if (kind === "md") downloadText(toMarkdown(transcript, resolveSpeaker), file, "text/markdown");
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-border-gray hover:border-itu-blue hover:text-itu-blue-dark text-sm text-dark-navy disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border-gray disabled:hover:text-dark-navy"
      >
        <Download size={14} /> Export <ChevronDown size={14} />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 bottom-full mb-2 w-64 bg-white border border-border-gray rounded-lg shadow-xl overflow-hidden z-10">
          <MenuItem onClick={doCopy}>Copy All (clipboard)</MenuItem>
          <MenuItem onClick={doCopyMarkdown}>Copy as Markdown</MenuItem>
          <MenuItem onClick={doDownloadDocx}>
            Download .docx ({mode === "power" ? "ITU template" : "personal"})
          </MenuItem>
          <MenuItem onClick={() => doDownload("md")}>Download .md</MenuItem>
          <MenuItem onClick={() => doDownload("txt")}>Download .txt</MenuItem>
          <MenuItem onClick={() => doDownload("srt")}>Download .srt</MenuItem>
          <MenuItem onClick={() => doDownload("json")}>Download .json</MenuItem>
        </div>
      )}
      {status && (
        <span className="absolute right-0 -top-6 text-xs text-success whitespace-nowrap">
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
      className="w-full text-left px-3 py-2 text-sm text-dark-navy hover:bg-itu-blue-pale"
    >
      {children}
    </button>
  );
}
