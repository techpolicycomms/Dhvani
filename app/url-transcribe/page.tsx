"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import { SUPPORTED_LANGUAGES } from "@/lib/constants";

type Stage = "idle" | "fetching" | "transcribing" | "done" | "error";

type Result = {
  text: string;
  segments: Array<{ speaker: string; text: string; start: number; end: number }>;
  language: string | null;
  source: { url: string; bytes: number; contentType: string };
};

export default function UrlTranscribePage() {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setStage("fetching");
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/url-transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: url.trim(), language: language || undefined }),
      });
      setStage("transcribing");
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setResult(body as Result);
      setStage("done");
    } catch (err) {
      setError((err as Error).message);
      setStage("error");
    }
  };

  return (
    <main className="min-h-screen bg-off-white">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <Link href="/" className="flex items-baseline gap-2 text-lg font-bold text-dark-navy">
          Dhvani <span className="text-mid-gray text-sm font-normal">ध्वनि</span>
        </Link>
        <NavLinks />
      </header>

      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-dark-navy flex items-center gap-2">
            <Link2 size={20} className="text-itu-blue" /> Transcribe from URL
          </h1>
          <p className="mt-1 text-sm text-mid-gray">
            Paste a direct audio or video link and Dhvani will download and transcribe it.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-mid-gray uppercase tracking-wider">
              Media URL
            </span>
            <input
              type="url"
              required
              placeholder="https://example.com/recording.mp3"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={stage === "fetching" || stage === "transcribing"}
              className="mt-1 w-full bg-white border border-border-gray rounded-lg px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-mid-gray uppercase tracking-wider">
              Language (optional)
            </span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={stage === "fetching" || stage === "transcribing"}
              className="mt-1 w-full bg-white border border-border-gray rounded-lg px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue disabled:opacity-60"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={stage === "fetching" || stage === "transcribing" || !url.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-itu-blue text-white text-sm font-semibold hover:bg-itu-blue-dark disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(stage === "fetching" || stage === "transcribing") && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {stage === "fetching"
              ? "Downloading…"
              : stage === "transcribing"
              ? "Transcribing…"
              : "Transcribe"}
          </button>
        </form>

        <div className="mt-4 text-[11px] text-mid-gray leading-relaxed">
          Supported today: direct audio/video URLs (.mp3 / .mp4 / .wav / .webm / .ogg / .m4a), up to 25 MB. YouTube, Google Drive, and Vimeo links are coming soon — for those, download the file locally and paste the direct URL.
        </div>

        {stage === "error" && error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-2 px-3 py-2 rounded border border-error/40 bg-error/5 text-sm text-error"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stage === "done" && result && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3 text-success">
              <CheckCircle2 size={16} />
              <span className="text-sm font-semibold">
                Transcribed {formatBytes(result.source.bytes)} ·{" "}
                {result.segments.length} segment
                {result.segments.length === 1 ? "" : "s"}
                {result.language ? ` · ${result.language}` : ""}
              </span>
            </div>
            <div className="rounded-lg border border-border-gray bg-white p-4 max-h-[60vh] overflow-y-auto text-sm leading-relaxed space-y-2">
              {result.segments.length > 0 ? (
                result.segments.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="font-mono text-xs text-itu-blue-dark shrink-0 min-w-[50px]">
                      {formatSecs(s.start)}
                    </span>
                    <span className="font-semibold text-dark-navy shrink-0">
                      {s.speaker}:
                    </span>
                    <span className="text-dark-gray">{s.text}</span>
                  </div>
                ))
              ) : (
                <p className="text-dark-gray whitespace-pre-wrap">{result.text}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([result.text], {
                  type: "text/plain;charset=utf-8",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `url-transcript-${Date.now()}.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded border border-itu-blue text-itu-blue text-xs font-semibold hover:bg-itu-blue-pale"
            >
              Download .txt
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function formatBytes(n: number): string {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
function formatSecs(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "00:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
