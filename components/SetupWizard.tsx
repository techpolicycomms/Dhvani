"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, ArrowRight } from "lucide-react";
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
      <h1 className="text-3xl font-bold mb-2 text-dark-navy">
        Dhvani <span className="text-mid-gray text-base font-normal">ध्वनि</span>
      </h1>
      <p className="text-mid-gray mb-8">
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
        <div className="mt-6 rounded-lg border border-border-gray bg-off-white p-4 space-y-3">
          <p className="text-sm text-dark-navy">
            Select the virtual audio cable device (install it first if you
            haven&apos;t):
          </p>
          <DeviceSelector value={deviceId} onChange={setDeviceId} />
          <Link
            href="/desktop-setup"
            className="inline-flex items-center gap-1 text-sm text-itu-blue-dark hover:text-itu-blue"
          >
            Need help? Open the setup guide <ExternalLink size={12} />
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
          className="px-4 py-2 text-sm text-mid-gray hover:text-dark-navy"
        >
          Skip
        </button>
        <button
          type="button"
          disabled={!mode}
          onClick={() => mode && onComplete(mode, deviceId)}
          className="inline-flex items-center gap-1.5 px-6 py-2 bg-itu-blue text-white rounded hover:bg-itu-blue-dark disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          Continue <ArrowRight size={14} />
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
          ? "border-itu-blue bg-itu-blue-pale"
          : "border-border-gray bg-white hover:border-itu-blue-light",
      ].join(" ")}
    >
      <div className="font-medium text-dark-navy">{title}</div>
      <div className="text-xs text-mid-gray mt-1">{body}</div>
    </button>
  );
}
