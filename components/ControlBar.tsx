"use client";

import { Play, Square, RotateCw } from "lucide-react";
import { formatElapsed } from "@/lib/audioUtils";
import type { CaptureMode } from "@/lib/constants";

type Props = {
  isCapturing: boolean;
  onStart: () => void;
  onStop: () => void;
  onReconnect: () => void;
  captureMode: CaptureMode | null;
  deviceLabel?: string;
  elapsedMs: number;
  chunkCount: number;
  queueDepth: number;
  inFlight: number;
  error: string | null;
  totalMinutes: number;
  estimatedCost: number;
  failedChunks: number;
  disabled?: boolean;
};

function modeLabel(mode: CaptureMode | null, deviceLabel?: string) {
  if (!mode) return "Not started";
  if (mode === "tab-audio") return "Tab Audio";
  if (mode === "microphone") return "Microphone";
  if (mode === "electron") return "Desktop (native)";
  if (mode === "virtual-cable")
    return `Virtual Cable${deviceLabel ? `: ${deviceLabel}` : ""}`;
  return mode;
}

/**
 * Sticky control bar with the big Start/Stop toggle, live status readout,
 * and cost estimate. The Start button is large enough to be a comfortable
 * touch target on phones.
 */
export function ControlBar(props: Props) {
  const {
    isCapturing,
    onStart,
    onStop,
    onReconnect,
    captureMode,
    deviceLabel,
    elapsedMs,
    chunkCount,
    queueDepth,
    inFlight,
    error,
    totalMinutes,
    estimatedCost,
    failedChunks,
    disabled,
  } = props;

  const canReconnect = !!error && !isCapturing && captureMode !== null;

  return (
    <div className="bg-white border-t border-border-gray p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Big Start/Stop button. */}
        <button
          type="button"
          onClick={isCapturing ? onStop : onStart}
          disabled={disabled}
          className={[
            "w-full sm:w-auto inline-flex items-center justify-center gap-2",
            "px-6 py-3 rounded-lg font-semibold text-base text-white",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            isCapturing
              ? "bg-error hover:bg-[#B91C1C]"
              : "bg-itu-blue hover:bg-itu-blue-dark",
          ].join(" ")}
          aria-pressed={isCapturing}
        >
          {isCapturing ? (
            <>
              <Square size={16} fill="currentColor" /> Stop
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" /> Start
            </>
          )}
        </button>

        {canReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-warning hover:bg-[#B45309] text-white font-medium"
          >
            <RotateCw size={14} /> Reconnect
          </button>
        )}

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
          <Stat label="Source" value={modeLabel(captureMode, deviceLabel)} />
          <Stat label="Elapsed" value={formatElapsed(elapsedMs)} mono />
          <Stat
            label="Segments"
            value={`${chunkCount}${failedChunks ? ` (${failedChunks} failed)` : ""}`}
          />
          <Stat
            label="Cost"
            value={`$${estimatedCost.toFixed(3)} (${totalMinutes.toFixed(1)} min)`}
          />
        </div>
      </div>

      {(queueDepth > 0 || inFlight > 0) && (
        <div className="mt-2 text-xs text-itu-blue-dark">
          Processing: {inFlight} in flight, {queueDepth} in queue
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="uppercase text-[10px] tracking-wider text-mid-gray">
        {label}
      </span>
      <span
        className={
          mono
            ? "font-mono text-dark-navy tabular-nums"
            : "text-dark-navy"
        }
      >
        {value}
      </span>
    </div>
  );
}
