"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingModal } from "@/components/shared/onboarding";
import { useUserPreferences } from "@/lib/store";
import { showToast } from "@/components/shared/toast-provider";
import { useT } from "@/lib/i18n/provider";
import { shouldShowOnboarding } from "@/lib/onboarding";

/**
 * `eligible` comes from the server (lib/onboarding-server.ts): only accounts
 * created after onboarding launched and with no docs/tasks yet qualify, so
 * existing users never see it even on a fresh browser.
 */
export function OnboardingWrapper({ eligible }: { eligible: boolean }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const hasCompletedOnboarding = useUserPreferences((s) => s.hasCompletedOnboarding);
  const setHasCompletedOnboarding = useUserPreferences((s) => s.setHasCompletedOnboarding);
  const t = useT();
  const show = shouldShowOnboarding(eligible, hasCompletedOnboarding);

  useEffect(() => {
    if (!show) return;
    // Short delay so the modal does not fight the dashboard's entry animation.
    const timer = setTimeout(() => setShowOnboarding(true), 500);
    return () => clearTimeout(timer);
  }, [show]);

  useEffect(() => {
    // An existing user on a fresh device: remember the decision locally.
    if (!eligible && !hasCompletedOnboarding) setHasCompletedOnboarding(true);
  }, [eligible, hasCompletedOnboarding, setHasCompletedOnboarding]);

  const handleComplete = () => {
    setShowOnboarding(false);
    showToast.success(t("ux.onboardingDone"));
  };

  const handleSkip = () => {
    setShowOnboarding(false);
    showToast.info(t("ux.onboardingSkipped"));
  };

  return (
    <AnimatePresence>
      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </AnimatePresence>
  );
}
