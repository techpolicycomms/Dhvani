"use client";

import Link from "next/link";
import { useState } from "react";
import type { CaptureMode } from "@/lib/constants";
import { TestAudio } from "./TestAudio";
import { DeviceSelector } from "./DeviceSelector";

type Props = {
  onComplete: (mode: CaptureMode, deviceId?: string) => void;
  language?: string;
  deviceId: string;
  setDeviceId: (id: string) => void;
};

/**
 * First-run setup wizard.
 *
 *   1. Pick how you're joining the meeting.
 *   2. (If virtual-cable) pick the input device.
 *   3. Run a 3-second test to confirm audio capture actually works.
 *   4. Confirm and jump to the main screen.
 */
export function SetupWizard({
  onComplete,
  language,
  deviceId,
  setDeviceId,
}: Props) {
  const [mode, setMode] = useState<CaptureMode | null>(null);

  return (
    <div className="max-w-2xl mx-auto p-6 sm:p-10">
      <h1 className="text-3xl font-bold mb-2">
        Dhvani <span className="text-white/50 text-base">ध्वनि</span>
      </h1>
      <p className="text-white/70 mb-8">
        Let&apos;s get you set up. How are you joining your meeting?
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <ChoiceCard
          selected={mode === "tab-audio"}
          onClick={() => setMode("tab-audio")}
          title="Browser tab"
          body="Zoom / Teams / Meet running in Chrome, Edge, or Firefox."
        />
        <ChoiceCard
          selected={mode === "virtual-cable"}
          onClick={() => setMode("virtual-cable")}
          title="Desktop app"
          body="Zoom / Teams desktop app. Needs a virtual audio cable."
        />
        <ChoiceCard
          selected={mode === "microphone"}
          onClick={() => setMode("microphone")}
          title="Mobile / mic"
          body="Place phone near speaker, or use a headset."
        />
      </div>

      {mode === "virtual-cable" && (
        <div className="mt-6 rounded-lg border border-white/10 bg-navy-light/40 p-4 space-y-3">
          <p className="text-sm text-white/80">
            Select the virtual audio cable device (install it first if you
            haven&apos;t):
          </p>
          <DeviceSelector value={deviceId} onChange={setDeviceId} />
          <Link
            href="/desktop-setup"
            className="inline-block text-sm text-teal hover:text-teal-dark"
          >
            Need help? Open the setup guide ↗
          </Link>
        </div>
      )}

      {mode && (
        <div className="mt-6">
          <TestAudio mode={mode} deviceId={deviceId} language={language} />
        </div>
      )}

      <div className="mt-8 flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => onComplete("microphone")}
          className="px-4 py-2 text-sm text-white/60 hover:text-white"
        >
          Skip
        </button>
        <button
          type="button"
          disabled={!mode}
          onClick={() => mode && onComplete(mode, deviceId)}
          className="px-6 py-2 bg-teal text-navy rounded hover:bg-teal-dark disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-left p-4 rounded-lg border transition-colors",
        selected
          ? "border-teal bg-teal/10"
          : "border-white/10 bg-navy-light/40 hover:border-white/30",
      ].join(" ")}
    >
      <div className="font-medium text-white">{title}</div>
      <div className="text-xs text-white/60 mt-1">{body}</div>
    </button>
  );
}
