"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Save, Settings, Sparkles, X } from "lucide-react";
import MeetingSummary from "@/components/MeetingSummary";
import type { ActionItem } from "@/components/ActionItems";
import AskDhvani from "@/components/AskDhvani";
import SpeakerStats from "@/components/SpeakerStats";
import MeetingKeywords from "@/components/MeetingKeywords";
import SentimentBadge from "@/components/SentimentBadge";
import FollowUpEmail from "@/components/FollowUpEmail";
import { AudioModeCards } from "@/components/AudioModeCards";
import { AudioModeSelector } from "@/components/AudioModeSelector";
import { AudioWaveform } from "@/components/AudioWaveform";
import { ControlBar } from "@/components/ControlBar";
import { ExportMenu } from "@/components/ExportMenu";
import { MeetingBanner } from "@/components/MeetingBanner";
import { MeetingList } from "@/components/MeetingList";
import { NavLinks } from "@/components/NavLinks";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useCalendarPrefs } from "@/hooks/useCalendarPrefs";
import { useMeetingReminders } from "@/hooks/useMeetingReminders";
import {
  useChunkDispatcher,
  useTranscription,
} from "@/hooks/useTranscription";
import { useTranscriptStore } from "@/hooks/useTranscriptStore";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import type { Meeting } from "@/lib/calendar";
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
    | {
        name?: string | null;
        email?: string | null;
        userId?: string;
        department?: string;
      }
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

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showResume, setShowResume] = useState(false);
  const [showSummaryPrompt, setShowSummaryPrompt] = useState(false);
  const [summaryMarkdown, setSummaryMarkdown] = useState<string | null>(null);
  const [summaryActionItems, setSummaryActionItems] = useState<ActionItem[]>([]);
  const [summaryKeywords, setSummaryKeywords] = useState<string[]>([]);
  const [summarySentiment, setSummarySentiment] = useState("");
  const [summaryTalkTime, setSummaryTalkTime] = useState<Array<{ speaker: string; percent: number }>>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  // -------- Calendar prefs (drives MeetingList + reminders visibility) --------
  const { prefs: calendarPrefs } = useCalendarPrefs();

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
    primeSpeakers,
    activeMeeting,
    setActiveMeeting,
    speakerNames,
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
    mediaStream,
  } = useAudioCapture({
    chunkDuration,
    preferredDeviceId: deviceId || undefined,
  });

  // -------- Transcription pipeline --------
  const [toast, setToast] = useState<string | null>(null);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);

  const {
    transcribeChunk,
    abort: abortTranscription,
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
      setRateLimitMsg(msg);
      abortTranscription();
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
  const captureStartedAtRef = useRef<string | null>(null);

  const onStart = useCallback(() => {
    console.log("[page] onStart called", {
      chosenMode,
      resolvedMode: (chosenMode as CaptureMode) || "microphone",
      startCaptureType: typeof startCapture,
    });
    setRateLimitMsg(null);
    captureStartedAtRef.current = new Date().toISOString();
    // Seed the speaker map: the signed-in user is almost always the
    // closest voice to the mic, so they become Speaker 1; further slots
    // come from the active meeting's attendee list, if any. Manual renames
    // are preserved by primeSpeakers.
    const userName = user?.name || user?.email || null;
    const attendeeNames = extractAttendeeNames(activeMeeting?.attendees);
    primeSpeakers(userName, attendeeNames);
    const mode = (chosenMode as CaptureMode) || "microphone";
    void startCapture(mode);
  }, [
    chosenMode,
    startCapture,
    user?.name,
    user?.email,
    activeMeeting,
    primeSpeakers,
  ]);

  const onStartFromMeeting = useCallback(
    (meeting: Meeting) => {
      // Tag the upcoming session with this meeting before kicking off capture
      // so the auto-save (and any user-initiated save) carries the metadata.
      setActiveMeeting(meeting);
      onStart();
    },
    [onStart, setActiveMeeting]
  );

  // -------- Save transcript to server --------
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const saveTranscriptToServer = useCallback(async () => {
    if (transcript.length === 0 || saveState === "saving") return;
    setSaveState("saving");
    try {
      const startedAt =
        captureStartedAtRef.current || transcript[0]?.timestamp || new Date().toISOString();
      const endedAt = new Date().toISOString();
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entries: transcript,
          speakerNames,
          startedAt,
          endedAt,
          durationMinutes: totalMinutes,
          chunkCount,
          estimatedCost,
          title: activeMeeting?.subject,
          meeting: activeMeeting
            ? {
                id: activeMeeting.id,
                subject: activeMeeting.subject,
                platform: activeMeeting.platform,
                start: activeMeeting.start,
                end: activeMeeting.end,
                organizer: activeMeeting.organizer,
              }
            : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (e) {
      setToast(`Failed to save transcript: ${(e as Error).message}`);
      setTimeout(() => setToast(null), 4000);
      setSaveState("idle");
    }
  }, [
    transcript,
    saveState,
    speakerNames,
    totalMinutes,
    chunkCount,
    estimatedCost,
    activeMeeting,
  ]);

  // Auto-tag opt-in: when capture stops, if the user enabled auto-tag and we
  // have an active meeting + non-empty transcript, save automatically.
  // Also prompt for AI summary if 5+ minutes of content.
  const wasCapturingRef = useRef(false);
  useEffect(() => {
    if (wasCapturingRef.current && !isCapturing) {
      if (
        calendarPrefs.autoTag &&
        activeMeeting &&
        transcript.length > 0
      ) {
        void saveTranscriptToServer();
      }
      // Prompt for AI summary after 5+ minutes of recording.
      if (transcript.length > 0 && totalMinutes >= 5) {
        setShowSummaryPrompt(true);
      }
    }
    wasCapturingRef.current = isCapturing;
  }, [
    isCapturing,
    calendarPrefs.autoTag,
    activeMeeting,
    transcript.length,
    saveTranscriptToServer,
    totalMinutes,
  ]);

  // -------- Reminders (browser notifications + sticky banner) --------
  const { currentReminder, dismissReminder } = useMeetingReminders();

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

  // -------- Main UI --------
  return (
    <main className="min-h-screen flex flex-col bg-off-white pt-[3px]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border-gray bg-white">
        <div className="flex items-center gap-4">
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
          <NavLinks isAdmin={isAdmin} />
        </div>

        <div className="flex items-center gap-2">
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

      {/* REMINDER BANNER (sticky) */}
      {currentReminder && (
        <MeetingBanner
          meeting={currentReminder}
          onStart={() => {
            onStartFromMeeting(currentReminder);
            dismissReminder(currentReminder.id);
          }}
          onDismiss={() => dismissReminder(currentReminder.id)}
        />
      )}

      {/* AUDIO SOURCE — always visible while idle so users pick before hitting Start */}
      {!isCapturing && (
        <section className="px-4 sm:px-6 pt-4">
          <AudioModeCards
            value={(chosenMode as CaptureMode) || ""}
            onChange={(next) => setChosenMode(next)}
          />
        </section>
      )}

      {/* CALENDAR + QUICK ACTION ROW */}
      {calendarPrefs.showMeetings && !isCapturing && (
        <section className="px-4 sm:px-6 pt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                Today&apos;s meetings
              </h2>
              <MeetingList onStartTranscription={onStartFromMeeting} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                Quick transcription
              </h2>
              <div className="rounded-lg border border-border-gray bg-white p-4 flex flex-col gap-3">
                <p className="text-sm text-dark-navy">
                  Start capturing your microphone or system audio without
                  picking a meeting first.
                </p>
                <button
                  onClick={() => {
                    console.log("[page] Start now (quick transcription) clicked");
                    setActiveMeeting(null);
                    onStart();
                  }}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded bg-itu-blue text-white text-sm font-semibold hover:bg-itu-blue-dark"
                >
                  <Mic size={14} />
                  Start now
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ACTIVE MEETING CHIP + live waveform */}
      {(activeMeeting || isCapturing) && (
        <div className="px-4 sm:px-6 pt-3 flex flex-wrap items-center gap-3">
          {activeMeeting && isCapturing && (
            <div className="inline-flex items-center gap-2 text-xs text-itu-blue-dark bg-itu-blue-pale border border-itu-blue/30 rounded px-2.5 py-1">
              <span className="font-semibold">Tagged:</span>
              <span className="truncate max-w-xs">{activeMeeting.subject}</span>
            </div>
          )}
          {isCapturing && (
            <div className="inline-flex items-center gap-2 text-xs text-itu-blue-dark">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-error opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
              </span>
              <span className="font-semibold">Recording</span>
              <AudioWaveform stream={mediaStream} active={isCapturing} />
            </div>
          )}
        </div>
      )}

      {/* TRANSCRIPT */}
      <section className="flex-1 p-3 sm:p-4 overflow-hidden">
        <TranscriptPanel
          transcript={transcript}
          isCapturing={isCapturing}
          detectedSpeakers={detectedSpeakers}
          resolveSpeaker={resolveSpeaker}
          renameSpeaker={renameSpeaker}
          pinnedIds={pinnedIds}
          isProcessing={isCapturing && (inFlight > 0 || queueDepth > 0)}
          onTogglePin={(id) =>
            setPinnedIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      </section>

      {/* AI SUMMARY */}
      {transcript.length > 0 && !isCapturing && (
        <section className="px-3 sm:px-4 pb-2">
          <MeetingSummary
            transcript={transcript}
            speakerNames={speakerNames}
            meetingSubject={activeMeeting?.subject}
            initialSummary={summaryMarkdown || undefined}
            initialActionItems={
              summaryActionItems.length > 0 ? summaryActionItems : undefined
            }
            onSummaryGenerated={(md, items, kw, sent, tt) => {
              setSummaryMarkdown(md);
              setSummaryActionItems(items);
              setSummaryKeywords(kw);
              setSummarySentiment(sent);
              setSummaryTalkTime(tt);
            }}
            onActionItemsChange={setSummaryActionItems}
          />
        </section>
      )}

      {/* SUMMARY PROMPT MODAL */}
      {showSummaryPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-w-sm w-full bg-white rounded-xl shadow-xl p-6 text-center">
            <Sparkles className="mx-auto mb-3 text-itu-blue" size={36} />
            <h3 className="text-lg font-semibold text-dark-navy mb-1">
              Meeting ended
            </h3>
            <p className="text-sm text-mid-gray mb-5">
              Generate an AI summary with key decisions and action items?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSummaryPrompt(false)}
                className="flex-1 px-4 py-2 border border-border-gray text-dark-navy rounded-lg hover:bg-light-gray text-sm font-medium"
              >
                Skip
              </button>
              <button
                onClick={() => {
                  setShowSummaryPrompt(false);
                  // Summary generation is handled by the MeetingSummary
                  // component — the presence of `summaryMarkdown === null`
                  // renders the "idle" state with a Generate button. We
                  // scroll down so the user sees it.
                  setTimeout(() => {
                    window.scrollTo({
                      top: document.body.scrollHeight,
                      behavior: "smooth",
                    });
                  }, 100);
                }}
                className="flex-1 px-4 py-2 bg-itu-blue text-white rounded-lg hover:bg-itu-blue-dark text-sm font-semibold"
              >
                Generate Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST-SUMMARY INSIGHTS */}
      {transcript.length > 0 && !isCapturing && summaryMarkdown && (
        <section className="px-3 sm:px-4 pb-2 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {summarySentiment && <SentimentBadge sentiment={summarySentiment} />}
            {summaryKeywords.length > 0 && <MeetingKeywords keywords={summaryKeywords} />}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <SpeakerStats
              transcript={transcript}
              speakerNames={speakerNames}
              talkTime={summaryTalkTime}
            />
            <div className="space-y-3">
              <FollowUpEmail
                summary={summaryMarkdown}
                actionItems={summaryActionItems}
                meetingSubject={activeMeeting?.subject}
              />
            </div>
          </div>
        </section>
      )}

      {/* ASK DHVANI */}
      {transcript.length > 0 && !isCapturing && (
        <section className="px-3 sm:px-4 pb-2">
          <AskDhvani scope="single" />
        </section>
      )}

      {/* EXPORT + SAVE MENU */}
      <div className="px-3 sm:px-4 pb-2 flex justify-end items-center gap-2">
        {transcript.length > 0 && (
          <button
            onClick={saveTranscriptToServer}
            disabled={saveState === "saving"}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border",
              "transition-colors",
              saveState === "saved"
                ? "bg-success text-white border-success"
                : "bg-white border-itu-blue text-itu-blue hover:bg-itu-blue-pale disabled:opacity-50",
            ].join(" ")}
            title="Save transcript to your history"
          >
            <Save size={12} />
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
              ? "Saved"
              : "Save transcript"}
          </button>
        )}
        <ExportMenu transcript={transcript} resolveSpeaker={resolveSpeaker} />
      </div>

      {/* AUDIO SOURCE SELECTOR — always visible, disabled during capture */}
      <div className="px-3 sm:px-4 pb-2">
        <AudioModeSelector
          value={(chosenMode as CaptureMode) || ""}
          onChange={(next) => setChosenMode(next)}
          locked={isCapturing}
          lockReason={
            isCapturing ? "Stop recording to switch audio source." : undefined
          }
        />
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

/**
 * Normalise meeting.attendees into a flat `string[]` of display names.
 *
 * The `Meeting` type's contract is `string[]` (via `fromGraphEvent`), but
 * `getDemoMeetings()` currently returns `{ name, email }[]` so we handle
 * both rather than force a type migration while the demo data evolves.
 */
function extractAttendeeNames(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  const names: string[] = [];
  for (const a of attendees) {
    if (typeof a === "string" && a.trim()) {
      names.push(a.trim());
    } else if (
      a &&
      typeof a === "object" &&
      "name" in a &&
      typeof (a as { name?: unknown }).name === "string"
    ) {
      const n = (a as { name: string }).name.trim();
      if (n) names.push(n);
    }
  }
  return names;
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
