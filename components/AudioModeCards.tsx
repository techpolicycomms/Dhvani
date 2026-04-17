"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { CaptureMode } from "@/lib/constants";

type Props = {
  value: CaptureMode | "";
  onChange: (mode: CaptureMode) => void;
};

type ModeDef = {
  id: CaptureMode;
  label: string;
  desc: string;
  icon: string;
};

const COMMON_MODES: ModeDef[] = [
  {
    id: "tab-audio",
    label: "Browser Tab",
    desc: "Zoom / Teams / Meet in Chrome",
    icon: "🖥",
  },
  {
    id: "microphone",
    label: "Microphone",
    desc: "Direct mic or phone",
    icon: "🎙",
  },
];

const ELECTRON_MODE: ModeDef = {
  id: "electron",
  label: "Desktop App",
  desc: "Native system audio — no setup",
  icon: "💻",
};

const VIRTUAL_CABLE_MODE: ModeDef = {
  id: "virtual-cable",
  label: "Desktop App",
  desc: "Needs Dhvani app or virtual cable",
  icon: "💻",
};

/**
 * Big 3-up audio source picker rendered on the home page. More visible
 * than the segmented-control variant so first-time users know they
 * can choose how audio is captured before hitting Start.
 *
 * Mode-specific hints appear below the cards. The smaller segmented
 * control in `AudioModeSelector` is still shown during recording as
 * the read-only source indicator.
 */
export function AudioModeCards({ value, onChange }: Props) {
  const selected = value || "microphone";
  const [hasElectron, setHasElectron] = useState(false);
  useEffect(() => {
    setHasElectron(
      typeof window !== "undefined" &&
        Boolean((window as unknown as { electronAPI?: unknown }).electronAPI)
    );
  }, []);

  const modes: ModeDef[] = [
    ...COMMON_MODES,
    hasElectron ? ELECTRON_MODE : VIRTUAL_CABLE_MODE,
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider">
        Audio source
      </div>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((mode) => {
          const isActive = selected === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChange(mode.id)}
              aria-pressed={isActive}
              className={[
                "text-center rounded-lg p-3 transition-colors cursor-pointer",
                isActive
                  ? "bg-itu-blue-pale border-2 border-itu-blue"
                  : "bg-white border border-border-gray hover:border-itu-blue-light",
              ].join(" ")}
            >
              <div className="text-xl leading-none">{mode.icon}</div>
              <div className="mt-1 text-xs font-semibold text-dark-navy">
                {mode.label}
              </div>
              <div className="mt-0.5 text-[10px] text-mid-gray leading-tight">
                {mode.desc}
              </div>
            </button>
          );
        })}
      </div>
      {selected === "tab-audio" && (
        <p className="text-[11px] text-itu-blue-dark flex items-start gap-1.5 pt-1">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            You&apos;ll be asked to pick a browser tab — make sure to check
            &quot;Share audio&quot;.
          </span>
        </p>
      )}
      {selected === "electron" && (
        <p className="text-[11px] text-itu-blue-dark flex items-start gap-1.5 pt-1">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            Capturing system audio directly — works with Teams, Zoom, Webex,
            Slack, WhatsApp, and any other desktop app.
          </span>
        </p>
      )}
      {selected === "virtual-cable" && (
        <p className="text-[11px] text-itu-blue-dark pt-1">
          For Teams/Zoom/Slack/WhatsApp desktop apps, the{" "}
          <Link href="/download" className="underline hover:text-itu-blue">
            Dhvani desktop app
          </Link>{" "}
          captures audio natively with no setup. Or{" "}
          <Link href="/desktop-setup" className="underline hover:text-itu-blue">
            use a virtual cable
          </Link>
          .
        </p>
      )}
    </div>
  );
}
