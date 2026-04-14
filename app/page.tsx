"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ControlBar } from "@/components/ControlBar";
import { ExportMenu } from "@/components/ExportMenu";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { SetupWizard } from "@/components/SetupWizard";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import {
  useChunkDispatcher,
  useTranscription,
} from "@/hooks/useTranscription";
import { useTranscriptStore } from "@/hooks/useTranscriptStore";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import {
  DEFAULT_CHUNK_DURATION_MS,
  LS_KEYS,
  type CaptureMode,
} from "@/lib/constants";

/**
 * Main Dhvani transcription interface.
 *
 * Responsibility map:
 *   - useTranscriptStore : in-memory transcript + localStorage persistence
 *   - useAudioCapture    : MediaRecorder-driven chunk production
 *   - useTranscription   : chunk → Whisper → text pipeline, with retries
 *
 * This page wires them together, owns the settings state, and renders
 * the header / controls / transcript layout.
 */
export default function HomePage() {
  // -------- Persisted settings --------
  const [apiKey, setApiKey] = usePersistedString(LS_KEYS.apiKey, "");
  const [language, setLanguage] = usePersistedString(LS_KEYS.language, "");
  const [chunkDuration, setChunkDuration] = usePersistedNumber(
    LS_KEYS.chunkDuration,
    DEFAULT_CHUNK_DURATION_MS
  );
  const [deviceId, setDeviceId] = usePersistedString(LS_KEYS.deviceId, "");
  const [chosenMode, setChosenMode] = usePersistedString(
    LS_KEYS.captureMode,
    ""
  );
  const [setupComplete, setSetupComplete] = usePersistedString(
    LS_KEYS.setupComplete,
    ""
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showResume, setShowResume] = useState(false);

  // -------- Transcript store --------
  const {
    transcript,
    addEntry,
    clearTranscript,
    hasSavedSession,
    resumeSession,
    discardSavedSession,
  } = useTranscriptStore();

  useEffect(() => {
    if (hasSavedSession) setShowResume(true);
  }, [hasSavedSession]);

  // -------- Audio capture --------
  const {
    startCapture,
    stopCapture,
    reconnect,
    isCapturing,
    captureMode,
    audioChunks,
    error,
    elapsedTime,
    chunkCount,
  } = useAudioCapture({
    chunkDuration,
    preferredDeviceId: deviceId || undefined,
  });

  // -------- Transcription pipeline --------
  const [toast, setToast] = useState<string | null>(null);
  const {
    transcribeChunk,
    queueDepth,
    inFlight,
    totalMinutes,
    estimatedCost,
    failedChunks,
  } = useTranscription({
    apiKey: apiKey || null,
    language,
    onEntry: addEntry,
    onError: (msg, idx) => {
      setToast(`Chunk ${idx + 1} failed: ${msg}`);
      setTimeout(() => setToast(null), 4000);
    },
  });

  useChunkDispatcher(audioChunks, transcribeChunk);

  // -------- Device label for the Source stat --------
  const { devices } = useAudioDevices();
  const deviceLabel = useMemo(
    () => devices.find((d) => d.deviceId === deviceId)?.label,
    [devices, deviceId]
  );

  // -------- Handlers --------
  const onStart = useCallback(() => {
    const mode = (chosenMode as CaptureMode) || "microphone";
    void startCapture(mode);
  }, [chosenMode, startCapture]);

  const onWizardComplete = useCallback(
    (mode: CaptureMode, chosenDeviceId?: string) => {
      setChosenMode(mode);
      if (chosenDeviceId !== undefined) setDeviceId(chosenDeviceId);
      setSetupComplete("1");
    },
    [setChosenMode, setDeviceId, setSetupComplete]
  );

  // Connection status dot color.
  const statusColor = error
    ? "bg-red-500"
    : isCapturing
    ? inFlight > 0
      ? "bg-yellow-400"
      : "bg-green-500"
    : "bg-gray-500";

  // -------- Resume prompt --------
  if (showResume) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-navy-light/60 border border-white/10 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-2">Resume previous session?</h2>
          <p className="text-white/70 text-sm mb-5">
            Dhvani saved a transcript from a previous session. Load it back in
            and continue, or start fresh.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                resumeSession();
                setShowResume(false);
              }}
              className="flex-1 px-4 py-2 bg-teal text-navy rounded hover:bg-teal-dark font-medium"
            >
              Resume
            </button>
            <button
              onClick={() => {
                discardSavedSession();
                setShowResume(false);
              }}
              className="flex-1 px-4 py-2 bg-navy border border-white/10 rounded hover:bg-navy-light"
            >
              Start fresh
            </button>
          </div>
        </div>
      </main>
    );
  }

  // -------- Setup wizard for first-run --------
  if (!setupComplete) {
    return (
      <main className="min-h-screen">
        <SetupWizard
          onComplete={onWizardComplete}
          apiKey={apiKey || undefined}
          language={language || undefined}
          deviceId={deviceId}
          setDeviceId={setDeviceId}
        />
      </main>
    );
  }

  // -------- Main UI --------
  return (
    <main className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 bg-navy-light/40">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold">Dhvani</span>
            <span className="text-white/50 text-sm">ध्वनि</span>
          </div>
          <span
            className={[
              "w-2.5 h-2.5 rounded-full",
              statusColor,
              isCapturing ? "pulse-recording" : "",
            ].join(" ")}
            aria-label="Connection status"
          />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/desktop-setup"
            className="text-xs text-white/60 hover:text-white hidden sm:inline"
          >
            Desktop setup
          </Link>
          <button
            onClick={() => {
              setSetupComplete("");
              stopCapture();
            }}
            className="text-xs text-white/60 hover:text-white hidden sm:inline"
          >
            Change source
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded hover:bg-white/10"
            aria-label="Open settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {/* TRANSCRIPT */}
      <section className="flex-1 p-3 sm:p-4 overflow-hidden">
        <TranscriptPanel transcript={transcript} isCapturing={isCapturing} />
      </section>

      {/* EXPORT MENU */}
      <div className="px-3 sm:px-4 pb-2 flex justify-end">
        <ExportMenu transcript={transcript} />
      </div>

      {/* CONTROL BAR */}
      <ControlBar
        isCapturing={isCapturing}
        onStart={onStart}
        onStop={stopCapture}
        onReconnect={reconnect}
        captureMode={captureMode || (chosenMode as CaptureMode) || null}
        deviceLabel={deviceLabel}
        elapsedMs={elapsedTime}
        chunkCount={chunkCount}
        queueDepth={queueDepth}
        inFlight={inFlight}
        error={error}
        totalMinutes={totalMinutes}
        estimatedCost={estimatedCost}
        failedChunks={failedChunks}
      />

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-28 right-4 max-w-sm bg-red-500/90 text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        language={language}
        setLanguage={setLanguage}
        chunkDuration={chunkDuration}
        setChunkDuration={setChunkDuration}
        deviceId={deviceId}
        setDeviceId={setDeviceId}
        onClearSession={clearTranscript}
      />
    </main>
  );
}

// -------- Small persistence helpers for client-side state --------

function usePersistedString(
  key: string,
  initial: string
): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(key);
    if (stored !== null) setValue(stored);
  }, [key]);
  const update = useCallback(
    (v: string) => {
      setValue(v);
      if (typeof window !== "undefined") localStorage.setItem(key, v);
    },
    [key]
  );
  return [value, update];
}

function usePersistedNumber(
  key: string,
  initial: number
): [number, (v: number) => void] {
  const [value, setValue] = useState<number>(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n)) setValue(n);
    }
  }, [key]);
  const update = useCallback(
    (v: number) => {
      setValue(v);
      if (typeof window !== "undefined") localStorage.setItem(key, String(v));
    },
    [key]
  );
  return [value, update];
}

function GearIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx={12} cy={12} r={3} />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
