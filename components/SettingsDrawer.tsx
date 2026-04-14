"use client";

import { useEffect, useState } from "react";
import { DeviceSelector } from "./DeviceSelector";
import {
  LS_KEYS,
  MAX_CHUNK_DURATION_MS,
  MIN_CHUNK_DURATION_MS,
  SUPPORTED_LANGUAGES,
} from "@/lib/constants";

type Props = {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  chunkDuration: number;
  setChunkDuration: (ms: number) => void;
  deviceId: string;
  setDeviceId: (id: string) => void;
  onClearSession: () => void;
};

type HealthState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

/**
 * Slide-in settings drawer. Persists everything to localStorage via the
 * state setters passed in from the parent (so settings survive reloads).
 */
export function SettingsDrawer(props: Props) {
  const {
    open,
    onClose,
    apiKey,
    setApiKey,
    language,
    setLanguage,
    chunkDuration,
    setChunkDuration,
    deviceId,
    setDeviceId,
    onClearSession,
  } = props;

  const [health, setHealth] = useState<HealthState>({ kind: "idle" });
  const [confirmClear, setConfirmClear] = useState(false);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const validateKey = async () => {
    setHealth({ kind: "checking" });
    try {
      const res = await fetch("/api/health", {
        headers: apiKey ? { "x-openai-key": apiKey } : {},
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setHealth({ kind: "ok", message: data.message });
      } else {
        setHealth({
          kind: "error",
          message: data.message || `Health check failed (${res.status})`,
        });
      }
    } catch (err) {
      setHealth({ kind: "error", message: (err as Error).message });
    }
  };

  return (
    <>
      {/* Backdrop. */}
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 bg-black/50 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
      />
      {/* Drawer. */}
      <aside
        className={[
          "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-navy-light border-l border-white/10 shadow-2xl",
          "transform transition-transform overflow-y-auto",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-navy-light">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/60 hover:text-white text-xl"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          <Field
            label="OpenAI API Key"
            hint="Stored only in your browser. Overrides any server-side key."
          >
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                className="flex-1 bg-navy border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-teal"
              />
              <button
                type="button"
                onClick={validateKey}
                disabled={health.kind === "checking"}
                className="px-3 py-2 text-sm bg-teal text-navy rounded hover:bg-teal-dark disabled:opacity-50"
              >
                Validate
              </button>
            </div>
            {health.kind === "ok" && (
              <p className="mt-1 text-xs text-teal">✓ {health.message}</p>
            )}
            {health.kind === "error" && (
              <p className="mt-1 text-xs text-red-400">✗ {health.message}</p>
            )}
          </Field>

          <Field
            label="Language"
            hint="Auto-detect works well; choose a specific language to improve accuracy."
          >
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-navy border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code || "auto"} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={`Chunk Duration: ${(chunkDuration / 1000).toFixed(0)}s`}
            hint="Shorter = faster appearance. Longer = fewer API calls."
          >
            <input
              type="range"
              min={MIN_CHUNK_DURATION_MS}
              max={MAX_CHUNK_DURATION_MS}
              step={1000}
              value={chunkDuration}
              onChange={(e) => setChunkDuration(parseInt(e.target.value, 10))}
              className="w-full accent-teal"
            />
            <div className="flex justify-between text-[10px] text-white/40 mt-1">
              <span>{MIN_CHUNK_DURATION_MS / 1000}s</span>
              <span>{MAX_CHUNK_DURATION_MS / 1000}s</span>
            </div>
          </Field>

          <Field
            label="Audio Input Device"
            hint="For virtual-cable mode (BlackHole / VB-Cable) or to pick a specific mic."
          >
            <DeviceSelector value={deviceId} onChange={setDeviceId} />
          </Field>

          <div className="pt-4 border-t border-white/10 space-y-3">
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w-full px-3 py-2 text-sm text-red-400 border border-red-400/30 rounded hover:bg-red-400/10"
              >
                Clear Current Session
              </button>
            ) : (
              <div className="p-3 rounded border border-red-400/30 bg-red-400/10 text-sm space-y-2">
                <p className="text-white/80">
                  This will erase the transcript from screen and local storage.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearSession();
                      setConfirmClear(false);
                    }}
                    className="flex-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Yes, clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 px-3 py-1.5 bg-navy border border-white/10 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <a
              href="https://github.com/techpolicycomms/dhvani"
              target="_blank"
              rel="noreferrer"
              className="block text-center text-sm text-teal hover:text-teal-dark"
            >
              About Dhvani · GitHub ↗
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/90 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}

// Re-export the storage keys so the parent can pre-load settings.
export { LS_KEYS };
