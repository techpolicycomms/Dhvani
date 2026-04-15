"use client";

import { useState } from "react";
import { Check, AlertTriangle } from "lucide-react";
import type { CaptureMode } from "@/lib/constants";
import { pickSupportedMimeType, blobToFile } from "@/lib/audioUtils";

type Props = {
  mode: CaptureMode;
  deviceId?: string;
  language?: string;
};

type Result =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "transcribing" }
  | { kind: "ok"; text: string }
  | { kind: "error"; message: string };

/**
 * 3-second test recording that round-trips through Whisper and shows the
 * result. Lets users confirm their audio routing actually captures audio
 * before starting a real meeting.
 */
export function TestAudio({ mode, deviceId, language }: Props) {
  const [state, setState] = useState<Result>({ kind: "idle" });

  const run = async () => {
    setState({ kind: "recording" });
    try {
      let stream: MediaStream;
      if (mode === "tab-audio") {
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        stream.getVideoTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        if (stream.getAudioTracks().length === 0) {
          throw new Error(
            "No audio track. Did you check 'Share audio' when picking the tab?"
          );
        }
      } else if (mode === "virtual-cable") {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const { mimeType, extension } = pickSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      await new Promise((r) => setTimeout(r, 3000));
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      stream.getTracks().forEach((t) => t.stop());

      setState({ kind: "transcribing" });

      const blob = new Blob(chunks, { type: mimeType || `audio/${extension}` });
      const file = blobToFile(blob, extension, 0);
      const form = new FormData();
      form.append("file", file);
      const headers: Record<string, string> = {
        "x-audio-seconds": "3",
        "x-chunk-id": "test",
      };
      if (language) headers["x-language"] = language;

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        headers,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const text = (data.text || "").trim();
      if (!text) {
        setState({
          kind: "error",
          message:
            "Recorded silence. Make sure audio is actually routing to this input.",
        });
        return;
      }
      setState({ kind: "ok", text });
    } catch (err) {
      setState({
        kind: "error",
        message: (err as Error).message || "Test failed.",
      });
    }
  };

  const busy = state.kind === "recording" || state.kind === "transcribing";

  return (
    <div className="rounded-lg border border-border-gray bg-off-white p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="px-4 py-2 bg-itu-blue text-white rounded hover:bg-itu-blue-dark disabled:opacity-50 text-sm font-medium"
        >
          {state.kind === "recording"
            ? "Recording 3s…"
            : state.kind === "transcribing"
            ? "Transcribing…"
            : "Test Audio (3s)"}
        </button>
        <p className="text-xs text-mid-gray">
          Speak or play audio for 3 seconds to confirm setup works.
        </p>
      </div>
      {state.kind === "ok" && (
        <div className="mt-3 p-3 rounded bg-itu-blue-pale border border-itu-blue/30 text-sm">
          <div className="text-success text-xs mb-1 inline-flex items-center gap-1">
            <Check size={12} /> Heard:
          </div>
          <div className="text-dark-navy">{state.text}</div>
        </div>
      )}
      {state.kind === "error" && (
        <div className="mt-3 p-3 rounded bg-error/5 border border-error/30 text-sm text-error inline-flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}
    </div>
  );
}
