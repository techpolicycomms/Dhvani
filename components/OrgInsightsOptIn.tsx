"use client";

import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

const LS_KEY = "dhvani-contribute-insights";

export function useOrgInsightsOptIn(): {
  optedIn: boolean;
  setOptedIn: (v: boolean) => void;
} {
  const [optedIn, setOptedInState] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOptedInState(localStorage.getItem(LS_KEY) === "true");
  }, []);
  const setOptedIn = (v: boolean) => {
    setOptedInState(v);
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, v ? "true" : "false");
    }
  };
  return { optedIn, setOptedIn };
}

/**
 * Lightweight toggle for the "contribute anonymous insights" preference.
 * Stored in localStorage so it stays client-side until the user acts on
 * it — no round-trip to set a default.
 */
export function OrgInsightsOptIn() {
  const { optedIn, setOptedIn } = useOrgInsightsOptIn();
  return (
    <div className="rounded-lg border border-border-gray bg-white p-3">
      <div className="flex items-start gap-3">
        <Shield size={16} className="mt-0.5 text-itu-blue-dark shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-dark-navy">
              Contribute anonymous meeting insights
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={optedIn}
              onClick={() => setOptedIn(!optedIn)}
              className={[
                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
                optedIn ? "bg-itu-blue" : "bg-border-gray",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-4 w-4 transform rounded-full bg-white transition",
                  optedIn ? "translate-x-4" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-mid-gray leading-snug">
            When enabled, anonymised metadata about your meetings (topics,
            duration, sentiment — never transcript text or names) is
            contributed to the organisational insights dashboard. Your
            identity is never linked to the data.
          </p>
        </div>
      </div>
    </div>
  );
}
