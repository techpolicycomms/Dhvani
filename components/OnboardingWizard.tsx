"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  profilesBySector,
  type RoleProfile,
} from "@/lib/roleProfiles";
import { useUserProfile } from "@/contexts/UserProfileContext";

const SECTOR_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  "ITU-R": { bg: "#DBEAFE", fg: "#1E40AF", label: "ITU-R · Radiocommunication" },
  "ITU-T": { bg: "#EDE9FE", fg: "#6D28D9", label: "ITU-T · Standardization" },
  "ITU-D": { bg: "#DCFCE7", fg: "#15803D", label: "ITU-D · Development" },
  "General Secretariat": { bg: "#F1F5F9", fg: "#334155", label: "General Secretariat" },
  All: { bg: "#FEF3C7", fg: "#92400E", label: "Cross-cutting" },
};

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
];

const FEATURE_PRIORITIES = [
  { id: "action-items", label: "Action item tracking" },
  { id: "keywords", label: "Keyword detection" },
  { id: "followup", label: "Follow-up emails" },
  { id: "summaries", label: "AI summaries" },
  { id: "search", label: "Transcript search" },
];

/**
 * Blocking onboarding flow. Renders in a fixed-position modal the
 * first time a user visits (no saved profile) or when they hit
 * "Change role" in Settings. Two steps: role card pick + languages
 * + feature priority ranking.
 */
export function OnboardingWizard() {
  const { saveProfile } = useUserProfile();
  const grouped = useMemo(() => profilesBySector(), []);
  const sectors = Object.keys(grouped);

  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<RoleProfile | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (p: RoleProfile) => {
    setSelected(p);
    // Seed languages from the role default unless user already chose.
    if (languages.length === 0) setLanguages(p.languages.slice(0, 3));
  };

  const toggleLang = (code: string) =>
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  const togglePriority = (id: string) =>
    setPriorities((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(0, 5)
    );

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        roleId: selected.id,
        preferredLanguages: languages,
        featurePriorities: priorities,
      });
    } catch (err) {
      setError((err as Error).message || "Could not save profile.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center py-10 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl mx-4 bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-dark-navy">
              Welcome to Dhvani
            </h2>
            <p className="text-sm text-mid-gray mt-1">
              Step {step} of 2 —{" "}
              {step === 1
                ? "what best describes your role?"
                : "working languages and priorities"}
            </p>
          </div>
          <div className="flex gap-1.5">
            <span
              className={`h-1.5 w-8 rounded-full ${step >= 1 ? "bg-itu-blue" : "bg-border-gray"}`}
            />
            <span
              className={`h-1.5 w-8 rounded-full ${step >= 2 ? "bg-itu-blue" : "bg-border-gray"}`}
            />
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
            {sectors.map((sector) => {
              const badge = SECTOR_BADGE[sector] ?? SECTOR_BADGE.All;
              return (
                <section key={sector}>
                  <div
                    className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded mb-2"
                    style={{ backgroundColor: badge.bg, color: badge.fg }}
                  >
                    {badge.label}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {grouped[sector].map((p) => {
                      const active = selected?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pick(p)}
                          className={[
                            "text-left p-3 rounded-lg border transition-colors",
                            active
                              ? "border-itu-blue bg-itu-blue-pale"
                              : "border-border-gray bg-white hover:border-itu-blue-light",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-dark-navy">
                                {p.label}
                              </div>
                              <div className="text-[11px] text-mid-gray mt-0.5 leading-snug">
                                {p.description}
                              </div>
                            </div>
                            {active && (
                              <Check size={14} className="shrink-0 text-itu-blue mt-0.5" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-1">
            <div>
              <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                Languages you use in meetings
              </div>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => {
                  const on = languages.includes(l.code);
                  return (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => toggleLang(l.code)}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        on
                          ? "bg-itu-blue text-white border-itu-blue"
                          : "bg-white text-dark-navy border-border-gray hover:border-itu-blue-light",
                      ].join(" ")}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-mid-gray uppercase tracking-wider mb-2">
                What matters most to you? (pick up to 5)
              </div>
              <div className="flex flex-wrap gap-2">
                {FEATURE_PRIORITIES.map((f) => {
                  const on = priorities.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => togglePriority(f.id)}
                      className={[
                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        on
                          ? "bg-itu-blue-pale text-itu-blue-dark border-itu-blue"
                          : "bg-white text-dark-navy border-border-gray hover:border-itu-blue-light",
                      ].join(" ")}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {selected && (
              <div className="rounded-lg border border-border-gray bg-off-white p-3 text-xs text-mid-gray leading-relaxed">
                You selected <span className="font-semibold text-dark-navy">{selected.label}</span> in {selected.department}. AI summaries and follow-ups will be tuned for this role. You can change this later from Settings.
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 text-xs text-error" role="alert">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep(step === 2 ? 1 : step)}
            disabled={step === 1}
            className="px-4 py-2 text-sm text-mid-gray hover:text-dark-navy disabled:opacity-40"
          >
            Back
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selected}
              className="px-5 py-2 rounded-lg bg-itu-blue text-white text-sm font-semibold hover:bg-itu-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={saving || !selected}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-itu-blue text-white text-sm font-semibold hover:bg-itu-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Get started
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
