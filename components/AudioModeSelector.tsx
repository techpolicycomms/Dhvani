"use client";

import { useEffect, useState } from "react";
import { Mic, MonitorPlay, Cable, Users } from "lucide-react";
import type { CaptureMode } from "@/lib/constants";

type Props = {
  value: CaptureMode | "";
  onChange: (next: CaptureMode) => void;
  /** When true, selection is disabled and clicks show the lock reason. */
  locked?: boolean;
  lockReason?: string;
};

type Option = {
  value: CaptureMode;
  label: string;
  hint: string;
  icon: typeof Mic;
};

const COMMON_OPTIONS: Option[] = [
  {
    value: "microphone",
    label: "Just me",
    hint: "Record only your voice.",
    icon: Mic,
  },
  {
    value: "tab-audio",
    label: "Browser tab",
    hint: "Meet / Teams / Zoom running in a browser tab.",
    icon: MonitorPlay,
  },
];

const ELECTRON_OPTION: Option = {
  value: "electron",
  label: "Meeting",
  hint: "Your microphone + the desktop app's audio, mixed — both sides of a Teams/Zoom/Webex/Slack/WhatsApp call.",
  icon: Users,
};

const VIRTUAL_CABLE_OPTION: Option = {
  value: "virtual-cable",
  label: "Virtual cable",
  hint: "Advanced: pre-routed BlackHole / VB-Cable device.",
  icon: Cable,
};

/**
 * Persistent capture-mode switcher. Sits above the Start/Stop bar so
 * users can change their audio source at any time — no need to restart
 * the setup wizard. Disabled (with an explanatory tooltip) while
 * capture is in progress, since swapping streams live would drop data.
 */
export function AudioModeSelector({ value, onChange, locked, lockReason }: Props) {
  const [hasElectron, setHasElectron] = useState(false);
  useEffect(() => {
    setHasElectron(
      typeof window !== "undefined" &&
        Boolean((window as unknown as { electronAPI?: unknown }).electronAPI)
    );
  }, []);
  const options: Option[] = [
    ...COMMON_OPTIONS,
    hasElectron ? ELECTRON_OPTION : VIRTUAL_CABLE_OPTION,
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-mid-gray">
        <Mic size={11} aria-hidden /> Audio source
        {locked && lockReason && (
          <span className="normal-case tracking-normal text-[11px] text-warning">
            {lockReason}
          </span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-label="Audio source"
        className="inline-flex items-stretch rounded-lg border border-border-gray bg-white overflow-hidden"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => {
                console.log("[AudioModeSelector] selected", opt.value);
                if (!selected) onChange(opt.value);
              }}
              title={locked ? lockReason : opt.hint}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium",
                "border-r border-border-gray last:border-r-0",
                "transition-colors",
                selected
                  ? "bg-itu-blue text-white"
                  : "text-dark-navy hover:bg-itu-blue-pale",
                locked && !selected ? "opacity-50 cursor-not-allowed" : "",
                locked && selected ? "cursor-not-allowed" : "",
              ].join(" ")}
            >
              <Icon size={12} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
