"use client";

import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useUserProfile } from "@/contexts/UserProfileContext";

/**
 * Thin client-side gate that renders the OnboardingWizard on top of
 * whatever page is showing when the user has no saved profile. Lives
 * in the root layout so it works across all routes.
 */
export function OnboardingGate() {
  const { needsOnboarding, loading } = useUserProfile();
  if (loading || !needsOnboarding) return null;
  return <OnboardingWizard />;
}
