"use client";

import { useEffect, useState } from "react";
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
  /** Minutes processed locally via in-browser Whisper (zero cost). */
  localMinutes?: number;
  estimatedCost: number;
  disabled?: boolean;
};

function modeLabel(mode: CaptureMode | null, deviceLabel?: string) {
  if (!mode) return "Not started";
  if (mode === "tab-audio") return "Browser tab";
  if (mode === "microphone") return "Just you";
  // Meeting mode mixes mic + system audio, which is the whole point —
  // surface it on the Source stat so the user can see both sides are
  // being captured without having to dig into settings.
  if (mode === "electron") return "You + system audio";
  if (mode === "virtual-cable")
    return `Virtual cable${deviceLabel ? `: ${deviceLabel}` : ""}`;
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
    localMinutes = 0,
    estimatedCost,
    disabled,
  } = props;

  const canReconnect = !!error && !isCapturing && captureMode !== null;

  // Transient "Starting…"/"Stopping…" state so the button gives instant
  // feedback even when getUserMedia / teardown takes a moment. Cleared as
  // soon as isCapturing flips to the target value (or after a 4 s
  // safety timeout, in case capture fails silently).
  const [transition, setTransition] = useState<"idle" | "starting" | "stopping">(
    "idle"
  );
  useEffect(() => {
    if (transition === "starting" && isCapturing) setTransition("idle");
    if (transition === "stopping" && !isCapturing) setTransition("idle");
  }, [isCapturing, transition]);
  useEffect(() => {
    if (transition === "idle") return;
    const t = window.setTimeout(() => setTransition("idle"), 4000);
    return () => window.clearTimeout(t);
  }, [transition]);

  const handleClick = () => {
    console.log("[ControlBar] Start/Stop clicked", {
      isCapturing,
      transition,
      willCall: isCapturing ? "onStop" : "onStart",
    });
    if (disabled) {
      console.log("[ControlBar] click ignored — button disabled");
      return;
    }
    if (isCapturing) {
      setTransition("stopping");
      onStop();
    } else {
      setTransition("starting");
      onStart();
    }
  };

  const buttonBusy = transition !== "idle";
  const buttonLabel =
    transition === "starting"
      ? "Starting…"
      : transition === "stopping"
      ? "Stopping…"
      : isCapturing
      ? "Stop"
      : "Start";
  const showStopVisual = isCapturing || transition === "stopping";

  return (
    <div className="bg-white border-t border-border-gray p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Big Start/Stop button. */}
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || buttonBusy}
          className={[
            "w-full sm:w-auto inline-flex items-center justify-center gap-2",
            "px-6 py-3 rounded-lg font-semibold text-base text-white",
            "transition-colors disabled:opacity-70 disabled:cursor-wait",
            showStopVisual
              ? "bg-error hover:bg-[#B91C1C]"
              : "bg-itu-blue hover:bg-itu-blue-dark",
          ].join(" ")}
          aria-pressed={isCapturing}
          aria-busy={buttonBusy}
        >
          {showStopVisual ? (
            <Square size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
          <span>{buttonLabel}</span>
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
          {/* Failed chunks are retried silently in the background via
              orphan-recovery; exposing a count makes the user anxious
              about something we've already committed to fixing. */}
          <Stat label="Segments" value={String(chunkCount)} />
          <Stat
            label="Cost"
            value={
              localMinutes > 0 && totalMinutes === 0
                ? `$0 · ${localMinutes.toFixed(1)} min local`
                : localMinutes > 0
                  ? `$${estimatedCost.toFixed(3)} · ${totalMinutes.toFixed(1)} cloud + ${localMinutes.toFixed(1)} local min`
                  : `$${estimatedCost.toFixed(3)} (${totalMinutes.toFixed(1)} min)`
            }
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
