"use client";

import { useSession } from "next-auth/react";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useUserProfile } from "@/contexts/UserProfileContext";

export function OnboardingGate() {
  const { needsOnboarding, loading } = useUserProfile();
  const { status } = useSession();
  if (loading || status !== "authenticated" || !needsOnboarding) return null;
  return <OnboardingWizard />;
}
