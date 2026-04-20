"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ArrowLeft, FileAudio, Loader2, Upload } from "lucide-react";
import { NavLinks } from "@/components/NavLinks";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { v4 as uuid } from "uuid";
import { formatElapsed } from "@/lib/audioUtils";
import { defaultSpeakerLabel, type TranscriptEntry } from "@/lib/constants";
import { createSpeakerStitcher } from "@/lib/speakerStitcher";

const MAX_CHUNK = 25 * 1024 * 1024;
const ACCEPTED = ".mp3,.mp4,.wav,.m4a,.webm,.ogg,.flac,.aac";

type UploadState = "idle" | "uploading" | "done" | "error";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (f: File) => {
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
    setState("uploading");
    setError("");
    setTranscript([]);
    setProgress(0);

    const chunks: Blob[] = [];
    if (f.size <= MAX_CHUNK) {
      chunks.push(f);
    } else {
      let offset = 0;
      while (offset < f.size) {
        chunks.push(f.slice(offset, offset + MAX_CHUNK));
        offset += MAX_CHUNK;
      }
    }

    const entries: TranscriptEntry[] = [];
    const stitcher = createSpeakerStitcher();
    for (let i = 0; i < chunks.length; i++) {
      setProgress(Math.round(((i) / chunks.length) * 100));
      const form = new FormData();
      const ext = f.name.split(".").pop() || "webm";
      form.append("file", new File([chunks[i]], `chunk-${i}.${ext}`, { type: f.type }));

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          headers: {
            "x-audio-seconds": String(Math.round((chunks[i].size / f.size) * (f.size / 16000))),
            "x-chunk-id": String(i),
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const segments = Array.isArray(data.segments) ? data.segments : [];
        if (segments.length > 0) {
          // Use the session-wide stitcher so uploaded multi-chunk files
          // get stable speaker ids across chunks (same fix as the live
          // recording pipeline in useTranscription).
          const chunkOffsetMs = (i * MAX_CHUNK) / 16;
          const { mapping } = stitcher.ingest(
            i,
            chunkOffsetMs,
            segments.map((s: { speaker?: string; start?: number; end?: number }) => ({
              speaker: s.speaker || "speaker_0",
              start: s.start || 0,
              end: s.end || (s.start || 0),
            }))
          );
          for (const s of segments) {
            const rawSpeaker = s.speaker || "speaker_0";
            const stableId = mapping.get(rawSpeaker);
            entries.push({
              id: uuid(),
              timestamp: formatElapsed((s.start || 0) * 1000 + chunkOffsetMs),
              text: (s.text || "").trim(),
              rawSpeaker,
              stableSpeakerId: stableId,
              speaker: defaultSpeakerLabel(stableId || rawSpeaker),
            });
          }
        } else if (data.text?.trim()) {
          entries.push({
            id: uuid(),
            timestamp: formatElapsed(i * 10000),
            text: data.text.trim(),
          });
        }
        setTranscript([...entries]);
      } catch (err) {
        setError((err as Error).message);
        setState("error");
        return;
      }
    }

    setProgress(100);
    setState("done");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) processFile(f);
    },
    [processFile]
  );

  return (
    <main className="min-h-screen bg-off-white pt-[3px]">
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-dark-navy">Dhvani</span>
              <span className="text-mid-gray text-sm">ध्वनि</span>
            </div>
            <span className="text-[11px] text-mid-gray">Meeting Transcription</span>
          </Link>
          <NavLinks isAdmin={false} />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-itu-blue-dark hover:text-itu-blue mb-4">
          <ArrowLeft size={14} /> Back
        </Link>

        <h1 className="text-xl font-bold text-dark-navy mb-4">Upload Audio/Video</h1>

        {state === "idle" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="border-2 border-dashed border-itu-blue/30 rounded-xl p-12 text-center hover:border-itu-blue/60 transition-colors cursor-pointer bg-white"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 text-itu-blue" size={40} />
            <p className="text-sm font-medium text-dark-navy mb-1">
              Drop an audio or video file here, or click to browse
            </p>
            <p className="text-xs text-mid-gray">
              Supported: MP3, MP4, WAV, M4A, WebM, OGG, FLAC, AAC
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              onChange={onSelect}
              className="hidden"
            />
          </div>
        )}

        {state === "uploading" && (
          <div className="bg-white border border-border-gray rounded-xl p-8 text-center">
            <Loader2 className="mx-auto mb-3 text-itu-blue animate-spin" size={32} />
            <p className="text-sm font-medium text-dark-navy mb-2">
              Processing {file?.name}...
            </p>
            <div className="w-full max-w-xs mx-auto h-2 rounded-full bg-light-gray overflow-hidden">
              <div
                className="h-full bg-itu-blue rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-mid-gray mt-2">{progress}% complete</p>
          </div>
        )}

        {state === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-4">
            <p className="text-sm text-red-800 mb-3">{error}</p>
            <button
              onClick={() => setState("idle")}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-itu-blue rounded-lg hover:bg-itu-blue-dark"
            >
              Try again
            </button>
          </div>
        )}

        {transcript.length > 0 && (
          <>
            <div className="mb-4">
              <label className="text-xs font-medium text-mid-gray uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full border border-border-gray rounded-lg px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40"
              />
            </div>
            <div className="bg-white border border-border-gray rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <FileAudio size={16} className="text-itu-blue" />
                <span className="text-sm font-semibold text-dark-navy">
                  Transcript ({transcript.length} entries)
                </span>
                {state === "done" && (
                  <span className="text-xs text-success font-medium ml-auto">Complete</span>
                )}
              </div>
              <TranscriptPanel
                transcript={transcript}
                isCapturing={state === "uploading"}
                detectedSpeakers={[]}
                resolveSpeaker={() => undefined}
                renameSpeaker={() => {}}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
