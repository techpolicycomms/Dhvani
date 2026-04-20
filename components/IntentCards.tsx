"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FileText,
  Info,
  MessageCircle,
  Monitor,
  Shield,
  Zap,
} from "lucide-react";
import type {
  CaptureIntent,
  CaptureMode,
  PrivacyMode,
} from "@/lib/constants";

type Props = {
  intent: CaptureIntent;
  privacy: PrivacyMode;
  /** Called when the user picks a new intent. */
  onIntentChange: (intent: CaptureIntent) => void;
  /** Called when the user flips the privacy sub-toggle. */
  onPrivacyChange: (privacy: PrivacyMode) => void;
  /**
   * Optional — component emits the underlying capture mode that
   * corresponds to the selected intent. `in-person` + `online-meeting`
   * map to different defaults, and `online-meeting` also has a
   * browser-tab vs. desktop-app sub-split.
   */
  onCaptureModeChange?: (mode: CaptureMode) => void;
};

/**
 * Intent-driven home-page picker. Replaces the old AudioModeCards
 * which framed the choice as "which audio source" — users don't
 * think that way. They think "what am I trying to capture?"
 *
 * Three intents:
 *
 *   1. Solo notes — private voice memo. Local Whisper on-device;
 *      GPT post-processes into action items + follow-ups when the
 *      recording stops. Single speaker. $0.
 *
 *   2. In-person conversation — 1-1 or small group, mic captures
 *      both sides of the table. Privacy sub-toggle:
 *        - On-device: local Whisper + local diarization (voice
 *          embedder clustering). No audio leaves the device.
 *        - Cloud: Azure gpt-4o-transcribe-diarize. Higher accuracy,
 *          per-minute cost.
 *
 *   3. Online meeting — Teams/Zoom/Meet via tab or desktop-app
 *      audio. Always cloud for now (diarizing tab-audio locally
 *      is on the roadmap). Browser-tab vs. desktop is auto-picked
 *      based on whether we're running inside the Electron wrapper.
 */
export function IntentCards({
  intent,
  privacy,
  onIntentChange,
  onPrivacyChange,
  onCaptureModeChange,
}: Props) {
  const [hasElectron, setHasElectron] = useState(false);
  useEffect(() => {
    setHasElectron(
      typeof window !== "undefined" &&
        Boolean(
          (window as unknown as { electronAPI?: unknown }).electronAPI
        )
    );
  }, []);

  // Whenever intent changes, notify the parent of the corresponding
  // capture mode so useAudioCapture picks the right stream acquirer.
  useEffect(() => {
    if (!onCaptureModeChange) return;
    if (intent === "solo-notes") onCaptureModeChange("microphone");
    else if (intent === "in-person") onCaptureModeChange("microphone");
    else if (intent === "online-meeting")
      onCaptureModeChange(hasElectron ? "electron" : "tab-audio");
  }, [intent, hasElectron, onCaptureModeChange]);

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider">
        What are you capturing?
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <IntentCard
          active={intent === "solo-notes"}
          icon={<FileText size={20} aria-hidden />}
          title="Solo notes"
          subtitle="On-device · $0"
          blurb="Private voice memo → structured action items"
          onClick={() => onIntentChange("solo-notes")}
        />
        <IntentCard
          active={intent === "in-person"}
          icon={<MessageCircle size={20} aria-hidden />}
          title="In-person conversation"
          subtitle={
            privacy === "on-device" ? "On-device · $0" : "Cloud · $"
          }
          blurb="1-1 or small group · mic captures everyone"
          onClick={() => onIntentChange("in-person")}
        />
        <IntentCard
          active={intent === "online-meeting"}
          icon={<Monitor size={20} aria-hidden />}
          title="Online meeting"
          subtitle="Cloud · $"
          blurb="Teams / Zoom / Meet in browser or app"
          onClick={() => onIntentChange("online-meeting")}
        />
      </div>

      {/* Per-intent hint + any sub-controls. */}
      {intent === "solo-notes" && (
        <IntentHint tone="info">
          Transcribes locally with Whisper — nothing leaves your
          device. After you stop, GPT organises the text into
          action items and follow-ups.
        </IntentHint>
      )}

      {intent === "in-person" && (
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-border-gray rounded-lg text-xs">
            <PrivacyPill
              active={privacy === "on-device"}
              icon={<Shield size={12} aria-hidden />}
              label="On-device"
              onClick={() => onPrivacyChange("on-device")}
            />
            <PrivacyPill
              active={privacy === "cloud"}
              icon={<Zap size={12} aria-hidden />}
              label="Better accuracy (cloud)"
              onClick={() => onPrivacyChange("cloud")}
            />
          </div>
          <IntentHint tone="info">
            {privacy === "on-device"
              ? "Transcribes + identifies speakers on this device. Voice stays private; no Azure cost. First recording downloads ~140 MB of model (cached after)."
              : "Sends audio to ITU's Azure deployment for high-accuracy transcription + speaker diarization. Counts against the monthly transcription budget."}
          </IntentHint>
        </div>
      )}

      {intent === "online-meeting" && (
        <IntentHint tone="info">
          {hasElectron ? (
            <>
              Records <strong>your microphone + the desktop app&apos;s audio</strong>{" "}
              mixed together. First time on macOS, grant Screen
              Recording permission, then quit and reopen Dhvani.
            </>
          ) : (
            <>
              You&apos;ll be asked to pick a browser tab — check{" "}
              <strong>&quot;Share audio&quot;</strong>. For Teams/Zoom/Slack
              desktop apps,{" "}
              <Link
                href="/download"
                className="underline hover:text-itu-blue"
              >
                install the Dhvani desktop app
              </Link>{" "}
              for native capture.
            </>
          )}
        </IntentHint>
      )}
    </div>
  );
}

function IntentCard({
  active,
  icon,
  title,
  subtitle,
  blurb,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "text-left rounded-lg p-3 transition-colors cursor-pointer",
        active
          ? "bg-itu-blue-pale border-2 border-itu-blue"
          : "bg-white border border-border-gray hover:border-itu-blue-light",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={active ? "text-itu-blue-dark" : "text-mid-gray"}
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-dark-navy truncate">
            {title}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-mid-gray">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="mt-1.5 text-[11px] text-mid-gray leading-snug">
        {blurb}
      </div>
    </button>
  );
}

function PrivacyPill({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md tap-tight",
        active
          ? "bg-itu-blue text-white font-semibold"
          : "text-mid-gray hover:text-dark-navy",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IntentHint({
  tone,
  children,
}: {
  tone: "info";
  children: React.ReactNode;
}) {
  return (
    <p className="text-[11px] text-itu-blue-dark flex items-start gap-1.5">
      <Info size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
