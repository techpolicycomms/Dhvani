"use client";

import { WHISPER_PRICE_PER_MINUTE } from "@/lib/constants";

type Props = {
  totalMinutes: number;
  estimatedCost: number;
  compact?: boolean;
};

/**
 * Running cost estimate. Azure OpenAI transcription (gpt-4o-transcribe-
 * diarize by default) is estimated at $0.006/minute of audio
 * ($0.36/hour) — the legacy Whisper rate. Actual pricing for gpt-4o
 * transcribe models may differ; verify in Azure Cost Management.
 */
export function CostEstimator({ totalMinutes, estimatedCost, compact }: Props) {
  if (compact) {
    return (
      <span className="text-xs text-white/60 tabular-nums">
        ${estimatedCost.toFixed(3)} · {totalMinutes.toFixed(1)} min
      </span>
    );
  }
  return (
    <div className="rounded-lg border border-white/10 bg-navy-light/50 p-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-white/60">Estimated cost</span>
        <span className="font-mono text-teal tabular-nums">
          ${estimatedCost.toFixed(4)}
        </span>
      </div>
      <div className="flex items-baseline justify-between mt-1">
        <span className="text-white/60">Audio sent</span>
        <span className="font-mono text-white/80 tabular-nums">
          {totalMinutes.toFixed(2)} min
        </span>
      </div>
      <p className="mt-2 text-[11px] text-white/40">
        Azure OpenAI transcribe: ~${WHISPER_PRICE_PER_MINUTE.toFixed(3)}/min
      </p>
    </div>
  );
}
