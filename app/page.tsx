"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Mic, Plus, Save, Settings, Sparkles, X, Zap } from "lucide-react";
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
import { TaskChecklist } from "@/components/TaskChecklist";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { WellnessIndicator } from "@/components/WellnessIndicator";
import { useCalendarPrefs } from "@/hooks/useCalendarPrefs";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useMeetingReminders } from "@/hooks/useMeetingReminders";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useMode } from "@/hooks/useMode";
import { useTranscriptionContext } from "@/contexts/TranscriptionContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import type { Meeting } from "@/lib/calendar";
import { type CaptureMode, type TranscriptEntry } from "@/lib/constants";

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

  // -------- Global transcription state (survives navigation) --------
  const ctx = useTranscriptionContext();
  const {
    language,
    setLanguage,
    chunkDuration,
    setChunkDuration,
    deviceId,
    setDeviceId,
    chosenMode,
    setChosenMode,
    toast,
    setToast,
    rateLimitMsg,
    setRateLimitMsg,
    clearSession,
  } = ctx;
  const {
    transcript,
    clearTranscript,
    hasSavedSession,
    resumeSession,
    discardSavedSession,
    detectedSpeakers,
    resolveSpeaker,
    renameSpeaker,
    updateEntryText,
    activeMeeting,
    setActiveMeeting,
    speakerNames,
  } = ctx.store;
  const {
    startCapture,
    stopCapture,
    reconnect,
    isCapturing,
    captureMode,
    error,
    elapsedTime,
    chunkCount,
    mediaStream,
  } = ctx.capture;
  const { queueDepth, inFlight, totalMinutes, estimatedCost } = ctx.tx;

  // -------- UI-only state (home page only) --------
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

  // -------- Personal/Power mode --------
  // Personal = stripped-down: just record, see your own notes, settings.
  // Power = full ITU surface (calendar, wellness, tasks, admin nav).
  const { mode } = useMode();
  const isPower = mode === "power";

  // In Personal mode the audio-source picker is hidden, so the record
  // button needs a default. Defaults differ by environment:
  //   - Electron desktop: "electron" (system-audio loopback — our
  //     differentiator; works on macOS 13+ / Win 10+ without any
  //     driver install via ScreenCaptureKit / WASAPI).
  //   - Browser: "microphone" (tab-audio would prompt a picker
  //     every time — wrong default for a Personal-mode flow).
  useEffect(() => {
    if (!isPower && !chosenMode) {
      const isElectron =
        typeof window !== "undefined" &&
        !!(window as { electronAPI?: { isElectron?: boolean } }).electronAPI
          ?.isElectron;
      setChosenMode(isElectron ? "electron" : "microphone");
    }
  }, [isPower, chosenMode, setChosenMode]);

  useEffect(() => {
    if (hasSavedSession) setShowResume(true);
  }, [hasSavedSession]);

  // -------- Device label for the Source stat --------
  const { devices } = useAudioDevices();
  const deviceLabel = useMemo(
    () => devices.find((d) => d.deviceId === deviceId)?.label,
    [devices, deviceId]
  );

  // -------- Expected speakers (for one-click assignment) --------
  // Signed-in user first, then every attendee from the active calendar
  // meeting. This list feeds the "Who is this?" picker beside each
  // detected voice cluster so users name a speaker in one click rather
  // than typing. Does not alter the primed-speaker-map heuristic in
  // onStart — it's an orthogonal, user-driven path.
  const currentUserLabel = useMemo(() => {
    const name = user?.name || user?.email || null;
    return name ? `${name} (you)` : null;
  }, [user?.name, user?.email]);
  const expectedSpeakers = useMemo(() => {
    const names: string[] = [];
    const self = user?.name || user?.email;
    if (self) names.push(self);
    const attendees = extractAttendeeNames(activeMeeting?.attendees);
    // De-duplicate (defensive: an attendee list might include the user).
    for (const a of attendees) {
      if (!names.some((existing) => existing.toLowerCase() === a.toLowerCase())) {
        names.push(a);
      }
    }
    return names;
  }, [user?.name, user?.email, activeMeeting]);

  // -------- Handlers --------
  const captureStartedAtRef = useRef<string | null>(null);

  const onStart = useCallback(async () => {
    console.log("[page] onStart called", {
      chosenMode,
      resolvedMode: (chosenMode as CaptureMode) || "microphone",
      startCaptureType: typeof startCapture,
      hasPriorTranscript: transcript.length > 0,
    });
    setRateLimitMsg(null);
    // If a prior transcript is still on screen from a previous Stop,
    // auto-save it to history and clear the view so this Record is a
    // clean session. Keeping the pin attached to the active meeting
    // because the user is almost always still in the same meeting when
    // they re-Record. Without this, new chunks append to the old
    // transcript and the recap confuses two recordings as one.
    if (transcript.length > 0) {
      await clearSession({ autoSave: true, preserveActiveMeeting: true });
    }
    captureStartedAtRef.current = new Date().toISOString();
    // Speaker seeding removed: Azure gpt-4o-transcribe-diarize returns
    // `speaker_0`/`speaker_1` per chunk with no cross-chunk identity, so
    // pre-mapping `speaker_0` → the signed-in user meant whoever the
    // diarizer labelled `speaker_0` in *any* chunk got renamed to the
    // user — everyone in the meeting ended up as "rahul jha". The
    // correct default is generic "Speaker 1/2/…" labels that the user
    // renames once they hear who's who. Re-introduce priming only when
    // we have persistent speaker embeddings.
    const mode = (chosenMode as CaptureMode) || "microphone";
    void startCapture(mode);
  }, [
    chosenMode,
    startCapture,
    transcript.length,
    clearSession,
    setRateLimitMsg,
  ]);

  // Week 7 — keyboard shortcuts. Cmd+R toggles record, Cmd+, opens
  // Settings, Esc closes any open drawer/modal. Memoised handlers
  // keep the listener stable across renders.
  useKeyboardShortcuts({
    onRecord: () => {
      if (isCapturing) stopCapture();
      else void onStart();
    },
    onSettings: () => setSettingsOpen((s) => !s),
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false);
    },
  });

  const onStartFromMeeting = useCallback(
    (meeting: Meeting) => {
      // The old flow was pre-fill-only (UX Addendum C2 "never auto-start"),
      // but live testing showed users clicked "Join & record" and saw
      // nothing happen — the pre-filled banner wasn't discoverable enough
      // to read as "your next action is to tap Record." We now auto-start
      // capture on join, because "Join & record" is explicit opt-in; if
      // the user wanted to only pre-fill they wouldn't click that button.
      setActiveMeeting(meeting);
      // Map detected platform → preferred capture mode. Browser-based
      // meeting clients work great with tab audio; native desktop apps
      // need either Electron (preferred) or virtual-cable.
      let mode: CaptureMode;
      if (meeting.platform === "meet" || meeting.platform === "teams") {
        mode = "tab-audio";
      } else if (typeof window !== "undefined" && (window as any).electronAPI) {
        mode = "electron";
      } else if (meeting.platform === "zoom") {
        mode = "virtual-cable";
      } else {
        mode = "microphone";
      }
      setChosenMode(mode);
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      // Kick off capture immediately. Passing `mode` explicitly rather
      // than relying on chosenMode state (which hasn't committed yet).
      void startCapture(mode);
    },
    [setActiveMeeting, setChosenMode, startCapture]
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
    setToast,
  ]);

  // Save on Stop (unconditional) + prompt for summary if session ≥ 5 min.
  //   Previously this was gated on `calendarPrefs.autoTag && activeMeeting`,
  //   which meant users who just recorded a free-form note had to
  //   remember to click Save before closing the tab — and we heard from
  //   users who didn't, then had no idea whether their session survived.
  //   Policy now: every non-empty transcript goes to the server when
  //   capture stops. The free-form cases already have OPFS + localStorage
  //   as belt-and-braces, but the server save is the canonical record.
  const wasCapturingRef = useRef(false);
  useEffect(() => {
    if (wasCapturingRef.current && !isCapturing) {
      if (transcript.length > 0) {
        void saveTranscriptToServer();
      }
      if (transcript.length > 0 && totalMinutes >= 5) {
        setShowSummaryPrompt(true);
      }
    }
    wasCapturingRef.current = isCapturing;
  }, [
    isCapturing,
    transcript.length,
    saveTranscriptToServer,
    totalMinutes,
  ]);

  // Periodic auto-save every 2 minutes during active capture. Belt-and-
  // braces: if the tab is force-closed mid-session before the
  // pagehide path runs, the latest committed snapshot is never more
  // than ~2 min stale. No-ops when capture isn't running (we save on
  // Stop from the effect above) or when the transcript is empty.
  useEffect(() => {
    if (!isCapturing) return;
    const id = window.setInterval(() => {
      if (transcript.length > 0 && saveState !== "saving") {
        void saveTranscriptToServer();
      }
    }, 120_000);
    return () => window.clearInterval(id);
  }, [isCapturing, transcript.length, saveState, saveTranscriptToServer]);

  // Save on tab close. We only listen to `pagehide` (fires once per
  // page lifetime when the tab is being discarded) rather than
  // `visibilitychange` (fires on every tab switch, which would create
  // a new saved transcript every time the user Alt-Tabs away).
  // sendBeacon is used so the request survives the unload — a normal
  // fetch would be cancelled. The server POST handler already ignores
  // duplicate id attempts and will cap at the daily save quota, so
  // this is safe to fire on every close.
  useEffect(() => {
    const flush = () => {
      if (transcript.length === 0) return;
      try {
        const payload = JSON.stringify({
          entries: transcript,
          speakerNames,
          startedAt:
            captureStartedAtRef.current ||
            transcript[0]?.timestamp ||
            new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationMinutes: totalMinutes,
          chunkCount,
          estimatedCost,
          title: activeMeeting?.subject,
          autoSavedOnUnload: true,
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon?.("/api/transcripts", blob);
      } catch {
        /* best-effort; OPFS + localStorage remain as fallbacks */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [
    transcript,
    speakerNames,
    totalMinutes,
    chunkCount,
    estimatedCost,
    activeMeeting,
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
          <NavLinks isAdmin={isAdmin} minimal={!isPower} />
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

      {/* REMINDER BANNER (sticky) — Power mode only. */}
      {isPower && currentReminder && (
        <MeetingBanner
          meeting={currentReminder}
          onStart={() => {
            onStartFromMeeting(currentReminder);
            dismissReminder(currentReminder.id);
          }}
          onDismiss={() => dismissReminder(currentReminder.id)}
        />
      )}

      {/* ROLE GREETING */}
      {!isCapturing && <RoleGreeting />}

      {/* PERSONAL MODE HERO — strips everything down to "tap to record".
          Shown only in Personal mode while idle. */}
      {!isPower && !isCapturing && (
        <section className="px-4 sm:px-6 pt-6 pb-2">
          <div className="max-w-xl">
            <h2 className="text-base font-medium text-dark-navy">
              Tap record to start a private note.
            </h2>
            <p className="mt-1 text-sm text-mid-gray">
              Speak your thoughts or record an in-person conversation. Audio is
              transcribed on your device&apos;s Azure tenant; nothing leaves
              your control.
            </p>
          </div>
        </section>
      )}

      {/* DASHBOARD — tasks + wellness. Power mode only; in Personal we
          intentionally hide the institutional dashboard for a quieter UI. */}
      {isPower && !isCapturing && (
        <section className="px-4 sm:px-6 pt-4 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TaskChecklist limit={5} hideCompleted />
          </div>
          <div>
            <WellnessIndicator />
          </div>
        </section>
      )}

      {/* AUDIO SOURCE — picker visible in Power. In Personal we default
          to microphone so the user just sees the record button. */}
      {isPower && !isCapturing && (
        <section className="px-4 sm:px-6 pt-4">
          <AudioModeCards
            value={(chosenMode as CaptureMode) || ""}
            onChange={(next) => setChosenMode(next)}
          />
        </section>
      )}

      {/* CALENDAR + QUICK ACTION ROW — Power only. */}
      {isPower && calendarPrefs.showMeetings && !isCapturing && (
        <section className="px-4 sm:px-6 pt-4 space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                <Calendar size={12} aria-hidden />
                Today&apos;s meetings
              </h2>
              <MeetingList onStartTranscription={onStartFromMeeting} />
            </div>
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                <Zap size={12} aria-hidden />
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
          {/* "Ready for…" pre-fill banner — Addendum C2.
              Shows when a meeting is queued via Transcribe but recording
              hasn't started yet. Disappears the moment isCapturing flips. */}
          {activeMeeting && !isCapturing && (
            <div className="inline-flex items-center gap-2 text-xs bg-itu-blue-pale border border-itu-blue/40 text-itu-blue-dark rounded px-3 py-1.5">
              <span className="font-semibold">Ready for:</span>
              <span className="truncate max-w-xs">{activeMeeting.subject}</span>
              <button
                type="button"
                onClick={() => setActiveMeeting(null)}
                aria-label="Dismiss"
                className="text-itu-blue-dark/60 hover:text-itu-blue-dark ml-1"
              >
                ×
              </button>
            </div>
          )}
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
              <LiveStats transcript={transcript} startedAtIso={captureStartedAtRef.current} />
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
          expectedSpeakers={expectedSpeakers}
          currentUserLabel={currentUserLabel}
          pinnedIds={pinnedIds}
          onEditEntry={updateEntryText}
          backpressure={inFlight + queueDepth}
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

      {/* EXPORT + SAVE + NEW SESSION MENU */}
      <div className="px-3 sm:px-4 pb-2 flex justify-end items-center gap-2">
        {transcript.length > 0 && !isCapturing && (
          <button
            onClick={async () => {
              const confirmed =
                transcript.length === 0 ||
                window.confirm(
                  "Start a new session? The current transcript will be auto-saved to your history, then cleared. Make sure you've exported it if you need a local copy."
                );
              if (!confirmed) return;
              await clearSession({ autoSave: true });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border bg-white border-border-gray text-dark-navy hover:bg-light-gray transition-colors"
            title="Clear the transcript and start a fresh recording session"
          >
            <Plus size={12} /> New Session
          </button>
        )}
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

      {/* AUDIO SOURCE SELECTOR — Power mode only. Personal mode is
          microphone-only by design (no segmented control). */}
      {isPower && (
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
      )}

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

/**
 * Normalise meeting.attendees into a flat `string[]` of display names.
 *
 * The `Meeting` type's contract is `string[]` (via `fromGraphEvent`), but
 * some upstream paths produce `{ name, email }[]`, so we accept both.
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

/**
 * Role-aware welcome strip. Pulls the active role from the profile
 * context and offers a quick link to re-open the onboarding wizard.
 * Silent (returns null) until the profile has loaded.
 */
function RoleGreeting() {
  const { data: session } = useSession();
  const { role, loading, resetProfile } = useUserProfile();
  if (loading) return null;
  const name =
    (session?.user?.name as string | undefined) ||
    (session?.user?.email as string | undefined) ||
    "there";
  return (
    <section className="px-4 sm:px-6 pt-4 flex flex-wrap items-center gap-3">
      <div className="text-sm text-dark-gray">
        Welcome back,{" "}
        <span className="font-semibold text-dark-navy">{name.split("@")[0]}</span> —{" "}
        <span className="text-itu-blue-dark">{role.label}</span>
        <span className="text-mid-gray"> · {role.sector}</span>
      </div>
      <button
        type="button"
        onClick={resetProfile}
        className="text-[11px] text-mid-gray hover:text-itu-blue underline underline-offset-2"
      >
        Change role
      </button>
    </section>
  );
}

/**
 * D1 — live word count + speaking-rate indicator next to the Recording
 * dot. Updates every 500ms, throttled to a rolling 60s WPM average.
 */
function LiveStats({
  transcript,
  startedAtIso,
}: {
  transcript: TranscriptEntry[];
  startedAtIso: string | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const wordCount = transcript.reduce(
    (n, e) => n + (e.text?.trim() ? e.text.trim().split(/\s+/).length : 0),
    0
  );
  if (!startedAtIso) return null;
  const elapsedSec = Math.max(1, (Date.now() - new Date(startedAtIso).getTime()) / 1000);
  const wpm = Math.round((wordCount / elapsedSec) * 60);
  return (
    <span className="text-[11px] text-mid-gray font-mono tabular-nums">
      {wordCount} words · {Number.isFinite(wpm) ? wpm : 0} wpm
    </span>
  );
}
