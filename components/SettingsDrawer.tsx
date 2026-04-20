"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  Database,
  ExternalLink,
  Languages,
  Leaf,
  LogOut,
  Mic,
  Palette,
  ShieldCheck,
  Sliders,
  Trash2,
  UserCircle2,
  X,
  type LucideIcon,
} from "lucide-react";
import { DeviceSelector } from "./DeviceSelector";
import { CalendarToggle } from "./CalendarToggle";
import VocabularyManager from "./VocabularyManager";
import { OrgInsightsOptIn } from "./OrgInsightsOptIn";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useMode } from "@/hooks/useMode";
import { useTheme } from "@/hooks/useTheme";
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
          "fixed inset-0 bg-dark-navy/30 z-40 transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
      />
      <aside
        className={[
          "fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-white border-l border-border-gray shadow-2xl",
          "transform transition-transform overflow-y-auto",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-gray sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-dark-navy">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-mid-gray hover:text-dark-navy p-1 rounded hover:bg-light-gray"
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {me && (
            <section className="rounded-lg border border-border-gray bg-off-white p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={me.name || me.email} />
                <div className="min-w-0">
                  <div className="font-medium text-dark-navy truncate">
                    {me.name || me.email}
                  </div>
                  <div className="text-xs text-mid-gray truncate">{me.email}</div>
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

          <ModeField />
          <ThemeField />
          <StorageField />

          <Field
            label="Language"
            icon={Languages}
            hint="Auto-detect works well; choose a specific language to improve accuracy."
          >
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-white border border-border-gray rounded px-3 py-2 text-sm text-dark-navy focus:outline-none focus:ring-2 focus:ring-itu-blue/40 focus:border-itu-blue"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code || "auto"} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={`Chunk Duration: ${(chunkDuration / 1000).toFixed(0)}s${
              chunkDuration >= 6000 && chunkDuration <= 8000
                ? " — recommended"
                : ""
            }`}
            icon={Sliders}
            hint="6–8 s is recommended for best accuracy. The diarizer needs ≥6 s of acoustic context to reliably differentiate speakers, and longer chunks give the language model more surrounding words to disambiguate homophones. Shorter chunks (1–3 s) make the first transcript entry appear faster but the text is noticeably less accurate and speakers collapse together."
          >
            <input
              type="range"
              min={MIN_CHUNK_DURATION_MS}
              max={MAX_CHUNK_DURATION_MS}
              step={1000}
              value={chunkDuration}
              onChange={(e) => setChunkDuration(parseInt(e.target.value, 10))}
              className="w-full accent-itu-blue"
            />
            <div className="flex justify-between text-[10px] text-mid-gray mt-1">
              <span>{MIN_CHUNK_DURATION_MS / 1000}s · latency</span>
              <span className="text-itu-blue-dark font-semibold">
                6–8s · recommended
              </span>
              <span>{MAX_CHUNK_DURATION_MS / 1000}s</span>
            </div>
          </Field>

          <Field
            label="Audio Input Device"
            icon={Mic}
            hint="For virtual-cable mode (BlackHole / VB-Cable) or to pick a specific mic."
          >
            <DeviceSelector value={deviceId} onChange={setDeviceId} />
          </Field>

          <div className="pt-4 border-t border-border-gray">
            <CalendarToggle />
          </div>

          <div className="pt-4 border-t border-border-gray">
            <VocabularyManager />
          </div>

          <div className="pt-4 border-t border-border-gray">
            <RoleSection />
          </div>

          <div className="pt-4 border-t border-border-gray space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-mid-gray uppercase tracking-wider">
              <ShieldCheck size={12} className="text-itu-blue" />
              Privacy
            </div>
            <OrgInsightsOptIn />
          </div>

          <div className="pt-4 border-t border-border-gray">
            <CarbonFootprintCard />
          </div>

          <div className="pt-4 border-t border-border-gray space-y-3">
            {isAdmin && (
              <a
                href="/admin"
                className="block text-center px-3 py-2 text-sm text-itu-blue-dark border border-itu-blue/40 rounded hover:bg-itu-blue-pale"
              >
                Open admin dashboard →
              </a>
            )}

            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-error border border-error/40 rounded hover:bg-error/5"
              >
                <Trash2 size={14} aria-hidden="true" />
                Clear Current Session
              </button>
            ) : (
              <div className="p-3 rounded border border-error/40 bg-error/5 text-sm space-y-2">
                <p className="text-dark-navy">
                  This will erase the transcript from screen and local storage.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearSession();
                      setConfirmClear(false);
                    }}
                    className="flex-1 px-3 py-1.5 bg-error text-white rounded hover:bg-[#B91C1C]"
                  >
                    Yes, clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 px-3 py-1.5 bg-white border border-border-gray text-dark-navy rounded hover:bg-light-gray"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onSignOut}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-dark-navy border border-border-gray rounded hover:bg-light-gray"
            >
              <LogOut size={14} aria-hidden="true" />
              Sign out
            </button>

            <a
              href="https://github.com/techpolicycomms/dhvani"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1 w-full text-center text-sm text-itu-blue-dark hover:text-itu-blue"
            >
              About Dhvani · GitHub <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}

function ModeField() {
  const { mode, setMode } = useMode();
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-dark-navy mb-1">
        <Briefcase size={13} className="text-itu-blue" aria-hidden="true" />
        Mode
      </label>
      <div
        role="radiogroup"
        aria-label="Mode"
        className="inline-flex items-stretch rounded-lg border border-border-gray bg-white overflow-hidden"
      >
        {(["personal", "power"] as const).map((m) => {
          const selected = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(m)}
              className={[
                "px-4 h-9 text-sm font-medium capitalize transition-colors",
                selected
                  ? "bg-itu-blue text-white"
                  : "text-dark-navy hover:bg-itu-blue-pale",
              ].join(" ")}
            >
              {m}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-mid-gray">
        {mode === "personal"
          ? "Quiet, first-person — your private notes."
          : "Dense, third-person — shareable meeting notes with Bureau tagging."}
      </p>
    </div>
  );
}

function StorageField() {
  const [info, setInfo] = useState<{
    backend: "azure-blob" | "local-filesystem";
    container: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/storage", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setInfo(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!info) return null;
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-dark-navy mb-1">
        <Database size={13} className="text-itu-blue" aria-hidden="true" />
        Where notes are stored
      </label>
      {info.backend === "azure-blob" ? (
        <p className="text-xs text-dark-navy">
          Azure Blob Storage ·{" "}
          <code className="font-mono text-mid-gray">{info.container}</code>
          <span className="block text-mid-gray mt-1">
            Survives redeploys. Inside your Azure tenant.
          </span>
        </p>
      ) : (
        <p className="text-xs text-warning">
          Server local disk · wiped on redeploy.
          <span className="block text-mid-gray mt-1">
            Set <code className="font-mono">AZURE_STORAGE_CONNECTION_STRING</code>{" "}
            in your env to switch to durable Azure Blob storage.
          </span>
        </p>
      )}
    </div>
  );
}

function ThemeField() {
  const { choice, setChoice } = useTheme();
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-dark-navy mb-1">
        <Palette size={13} className="text-itu-blue" aria-hidden="true" />
        Appearance
      </label>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="inline-flex items-stretch rounded-lg border border-border-gray bg-white overflow-hidden"
      >
        {(["light", "system", "dark"] as const).map((t) => {
          const selected = choice === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(t)}
              className={[
                "px-3 h-9 text-sm font-medium capitalize transition-colors",
                selected
                  ? "bg-itu-blue text-white"
                  : "text-dark-navy hover:bg-itu-blue-pale",
              ].join(" ")}
            >
              {t}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-mid-gray">
        System follows your OS — Dhvani re-tints automatically when it changes.
      </p>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-dark-navy mb-1">
        {Icon && <Icon size={13} className="text-itu-blue" aria-hidden="true" />}
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-mid-gray">{hint}</p>}
    </div>
  );
}

function RoleSection() {
  const { role, resetProfile } = useUserProfile();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-mid-gray uppercase tracking-wider">
        <UserCircle2 size={12} className="text-itu-blue" aria-hidden="true" />
        Role profile
      </div>
      <div className="rounded-lg border border-border-gray bg-white p-3 text-xs text-dark-gray">
        <div className="font-medium text-dark-navy">{role.label}</div>
        <div className="text-mid-gray mt-0.5">
          {role.department} · {role.sector}
        </div>
        <div className="mt-1 text-[11px] text-mid-gray leading-snug">
          {role.description}
        </div>
        <button
          type="button"
          onClick={resetProfile}
          className="mt-3 text-[11px] text-itu-blue hover:text-itu-blue-dark underline underline-offset-2"
        >
          Change role
        </button>
      </div>
    </div>
  );
}

function CarbonFootprintCard() {
  const [data, setData] = useState<{
    minutes: number;
    carbonGrams: number;
    googleSearches: number;
  } | null>(null);
  useEffect(() => {
    fetch("/api/me/emissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, []);
  return (
    <div className="rounded-lg border border-border-gray bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-dark-navy mb-2">
        <Leaf size={14} className="text-success" /> Your Carbon Footprint
      </div>
      {!data ? (
        <div className="text-[11px] text-mid-gray">
          No activity in the last 30 days yet.
        </div>
      ) : (
        <div className="text-[11px] text-mid-gray leading-relaxed">
          <div className="text-dark-navy">
            <span className="font-semibold tabular-nums">
              {data.minutes.toFixed(1)} min
            </span>{" "}
            transcribed →{" "}
            <span className="font-semibold tabular-nums">
              {(data.carbonGrams / 1000).toFixed(4)} kg CO₂e
            </span>
          </div>
          <div>
            Equivalent to ~{data.googleSearches.toLocaleString()} Google searches.
          </div>
        </div>
      )}
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
      <div className="text-[10px] uppercase tracking-wider text-mid-gray">
        {label}
      </div>
      <div className="font-mono text-dark-navy tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-mid-gray">{sub}</div>}
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
    <div className="w-10 h-10 rounded-full bg-itu-blue text-white flex items-center justify-center font-semibold shrink-0">
      {initials || "?"}
    </div>
  );
}
