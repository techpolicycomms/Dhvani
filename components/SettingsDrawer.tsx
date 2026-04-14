"use client";

import { useEffect, useState } from "react";
import { DeviceSelector } from "./DeviceSelector";
import {
  MAX_CHUNK_DURATION_MS,
  MIN_CHUNK_DURATION_MS,
  SUPPORTED_LANGUAGES,
} from "@/lib/constants";

export type MeUsage = {
  name: string | null;
  email: string;
  usage: { todayMinutes: number; monthMinutes: number; totalMinutes: number };
  quota: {
    limits: {
      perHour: number;
      perDay: number;
      monthlyBudgetUsd: number;
    };
    remaining: {
      hourMinutes: number;
      dayMinutes: number;
      monthBudgetUsd: number;
    };
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  language: string;
  setLanguage: (lang: string) => void;
  chunkDuration: number;
  setChunkDuration: (ms: number) => void;
  deviceId: string;
  setDeviceId: (id: string) => void;
  onClearSession: () => void;
  onSignOut: () => void;
  isAdmin: boolean;
};

/**
 * Settings drawer. In the org deployment there's no API key field — the
 * admin manages credentials server-side. We surface:
 *   - Language + chunk duration + audio device
 *   - Personal usage and remaining quota
 *   - Clear-session + Sign-out + About
 */
export function SettingsDrawer(props: Props) {
  const {
    open,
    onClose,
    language,
    setLanguage,
    chunkDuration,
    setChunkDuration,
    deviceId,
    setDeviceId,
    onClearSession,
    onSignOut,
    isAdmin,
  } = props;

  const [confirmClear, setConfirmClear] = useState(false);
  const [me, setMe] = useState<MeUsage | null>(null);

  // Refresh usage each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/me/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled) setMe(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 bg-black/50 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
      />
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
          {me && (
            <section className="rounded-lg border border-white/10 bg-navy/40 p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={me.name || me.email} />
                <div className="min-w-0">
                  <div className="font-medium truncate">{me.name || me.email}</div>
                  <div className="text-xs text-white/50 truncate">{me.email}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <UsageStat
                  label="Today"
                  value={`${me.usage.todayMinutes.toFixed(1)} min`}
                  sub={`${me.quota.remaining.dayMinutes.toFixed(0)} min left today`}
                />
                <UsageStat
                  label="This month"
                  value={`${me.usage.monthMinutes.toFixed(1)} min`}
                  sub={`${me.quota.limits.perDay}/day cap`}
                />
              </div>
            </section>
          )}

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
            {isAdmin && (
              <a
                href="/admin"
                className="block text-center px-3 py-2 text-sm text-teal border border-teal/30 rounded hover:bg-teal/10"
              >
                Open admin dashboard →
              </a>
            )}

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

            <button
              type="button"
              onClick={onSignOut}
              className="w-full px-3 py-2 text-sm text-white/80 border border-white/10 rounded hover:bg-white/5"
            >
              Sign out
            </button>

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

function UsageStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="font-mono text-white/90 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="w-10 h-10 rounded-full bg-teal text-navy flex items-center justify-center font-semibold shrink-0">
      {initials || "?"}
    </div>
  );
}
