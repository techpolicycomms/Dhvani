"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import type { CaptureMode } from "@/lib/constants";

type Props = {
  value: CaptureMode | "";
  onChange: (mode: CaptureMode) => void;
};

const MODES: Array<{
  id: CaptureMode;
  label: string;
  desc: string;
  icon: string;
}> = [
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
  {
    id: "virtual-cable",
    label: "Desktop App",
    desc: "Virtual cable required",
    icon: "💻",
  },
];

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
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider">
        Audio source
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((mode) => {
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
      {selected === "virtual-cable" && (
        <p className="text-[11px] text-itu-blue-dark pt-1">
          Need help?{" "}
          <Link href="/desktop-setup" className="underline hover:text-itu-blue">
            See the desktop setup guide.
          </Link>
        </p>
      )}
    </div>
  );
}
