"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { findRoleProfile, type RoleProfile } from "@/lib/roleProfiles";

type RemoteProfile = {
  userId: string;
  roleId: string;
  preferredLanguages: string[];
  featurePriorities: string[];
  updatedAt: string;
};

type Ctx = {
  loading: boolean;
  /** True when the user has no saved profile — show onboarding. */
  needsOnboarding: boolean;
  /** Resolved RoleProfile (always non-null — defaults to "cross-general"). */
  role: RoleProfile;
  /** Persisted prefs from /api/user/profile. Null until onboarded. */
  profile: RemoteProfile | null;
  /** Save a new profile and hide the wizard. */
  saveProfile: (input: {
    roleId: string;
    preferredLanguages?: string[];
    featurePriorities?: string[];
  }) => Promise<void>;
  /** Re-open onboarding from Settings. */
  resetProfile: () => void;
};

const Context = createContext<Ctx | null>(null);

export function useUserProfile(): Ctx {
  const c = useContext(Context);
  if (!c) throw new Error("useUserProfile must be used inside UserProfileProvider");
  return c;
}

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<RemoteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOnboarding, setManualOnboarding] = useState(false);

  // Load once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { credentials: "include" });
        if (!cancelled && res.ok) {
          const body = (await res.json()) as { profile: RemoteProfile | null };
          setProfile(body.profile);
        }
      } catch {
        /* remain in onboarding state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveProfile = useCallback<Ctx["saveProfile"]>(async (input) => {
    const res = await fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Failed to save profile (${res.status})`);
    const body = (await res.json()) as { profile: RemoteProfile };
    setProfile(body.profile);
    setManualOnboarding(false);
  }, []);

  const resetProfile = useCallback(() => {
    setManualOnboarding(true);
  }, []);

  const role = useMemo(() => findRoleProfile(profile?.roleId), [profile]);
  const needsOnboarding = !loading && (profile === null || manualOnboarding);

  return (
    <Context.Provider
      value={{ loading, needsOnboarding, role, profile, saveProfile, resetProfile }}
    >
      {children}
    </Context.Provider>
  );
}
