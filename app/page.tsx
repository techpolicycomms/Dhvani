"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings, X } from "lucide-react";
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
 * Ownership in the org deployment:
 *   - `next-auth/react` SessionProvider → current user (from server-side auth())
 *   - useTranscriptStore : in-memory transcript + localStorage persistence
 *   - useAudioCapture    : MediaRecorder-driven chunk production
 *   - useTranscription   : chunk → /api/transcribe → text pipeline
 *
 * There is no client-side API key anymore; the server resolves one from
 * process.env and enforces per-user quotas.
 */
export default function HomePage() {
  const { data: session } = useSession();
  const user = session?.user as
    | { name?: string | null; email?: string | null; userId?: string }
    | undefined;

  // Whether the signed-in user can see the admin dashboard link. We
  // don't trust the client with the actual allowlist; /admin itself is
  // protected server-side. This just controls UI affordances.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    // Probe the admin endpoint — a 200 means we're allowed.
    fetch("/api/admin/config")
      .then((r) => setIsAdmin(r.ok))
      .catch(() => setIsAdmin(false));
  }, []);

  // -------- Persisted UI preferences --------
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
    detectedSpeakers,
    resolveSpeaker,
    renameSpeaker,
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
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  const {
    transcribeChunk,
    queueDepth,
    inFlight,
    totalMinutes,
    estimatedCost,
    failedChunks,
  } = useTranscription({
    language,
    onEntry: addEntry,
    onError: (msg, idx) => {
      setToast(`Chunk ${idx + 1} failed: ${msg}`);
      setTimeout(() => setToast(null), 4000);
    },
    onRateLimited: (msg) => {
      // Hard stop: the server is refusing further work.
      setRateLimitMsg(msg);
      stopCapture();
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
    setRateLimitMsg(null);
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
    ? "bg-error"
    : isCapturing
    ? inFlight > 0
      ? "bg-warning"
      : "bg-success"
    : "bg-mid-gray/50";

  // -------- Resume prompt --------
  if (showResume) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 pt-10">
        <div className="max-w-md w-full bg-white border border-border-gray rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2 text-dark-navy">
            Resume previous session?
          </h2>
          <p className="text-mid-gray text-sm mb-5">
            Dhvani saved a transcript from a previous session. Load it back in
            and continue, or start fresh.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                resumeSession();
                setShowResume(false);
              }}
              className="flex-1 px-4 py-2 bg-itu-blue text-white rounded hover:bg-itu-blue-dark font-medium"
            >
              Resume
            </button>
            <button
              onClick={() => {
                discardSavedSession();
                setShowResume(false);
              }}
              className="flex-1 px-4 py-2 bg-white border border-border-gray text-dark-navy rounded hover:bg-light-gray"
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
      <main className="min-h-screen pt-3">
        <SetupWizard
          onComplete={onWizardComplete}
          language={language || undefined}
          deviceId={deviceId}
          setDeviceId={setDeviceId}
        />
      </main>
    );
  }

  // -------- Main UI --------
  return (
    <main className="min-h-screen flex flex-col bg-off-white pt-[3px]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-dark-navy leading-tight">
                Dhvani
              </span>
              <span className="text-mid-gray text-sm">ध्वनि</span>
            </div>
            <span className="text-[11px] text-mid-gray leading-tight">
              Meeting Transcription
            </span>
          </div>
          <span
            className={[
              "w-2.5 h-2.5 rounded-full",
              statusColor,
            ].join(" ")}
            aria-label="Connection status"
          />
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-xs text-itu-blue-dark hover:text-itu-blue hidden sm:inline"
            >
              Admin
            </Link>
          )}
          <Link
            href="/desktop-setup"
            className="text-xs text-mid-gray hover:text-dark-navy hidden sm:inline"
          >
            Desktop setup
          </Link>
          <button
            onClick={() => {
              setSetupComplete("");
              stopCapture();
            }}
            className="text-xs text-mid-gray hover:text-dark-navy hidden sm:inline"
          >
            Change source
          </button>
          {user && (
            <div className="hidden sm:flex items-center gap-2 pr-1">
              <UserChip name={user.name || user.email || "?"} />
            </div>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded text-mid-gray hover:text-dark-navy hover:bg-light-gray"
            aria-label="Open settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* TRANSCRIPT */}
      <section className="flex-1 p-3 sm:p-4 overflow-hidden">
        <TranscriptPanel
          transcript={transcript}
          isCapturing={isCapturing}
          detectedSpeakers={detectedSpeakers}
          resolveSpeaker={resolveSpeaker}
          renameSpeaker={renameSpeaker}
        />
      </section>

      {/* EXPORT MENU */}
      <div className="px-3 sm:px-4 pb-2 flex justify-end">
        <ExportMenu transcript={transcript} resolveSpeaker={resolveSpeaker} />
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

      {/* RATE LIMIT BANNER (persistent) */}
      {rateLimitMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 max-w-md bg-warning text-white text-sm px-4 py-3 rounded-lg shadow-lg flex items-start gap-3">
          <span className="font-semibold">Quota reached:</span>
          <span>{rateLimitMsg}</span>
          <button
            onClick={() => setRateLimitMsg(null)}
            className="text-white/80 hover:text-white shrink-0"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-28 right-4 max-w-sm bg-error text-white text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        language={language}
        setLanguage={setLanguage}
        chunkDuration={chunkDuration}
        setChunkDuration={setChunkDuration}
        deviceId={deviceId}
        setDeviceId={setDeviceId}
        onClearSession={clearTranscript}
        onSignOut={() => void signOut({ callbackUrl: "/auth/signin" })}
        isAdmin={isAdmin}
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

function UserChip({ name }: { name: string }) {
  const initials = name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="w-8 h-8 rounded-full bg-itu-blue text-white flex items-center justify-center text-xs font-bold"
      title={name}
      aria-label={`Signed in as ${name}`}
    >
      {initials || "?"}
    </span>
  );
}
