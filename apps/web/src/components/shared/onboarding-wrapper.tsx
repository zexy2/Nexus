"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingModal } from "@/components/shared";
import { useUserPreferences } from "@/lib/store";
import { showToast } from "@/components/shared/toast-provider";
import { useT } from "@/lib/i18n/provider";

export function OnboardingWrapper() {
  const t = useT();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { hasCompletedOnboarding } = useUserPreferences();

  useEffect(() => {
    // Show onboarding modal for new users after a short delay
    if (!hasCompletedOnboarding) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedOnboarding]);

  const handleComplete = () => {
    setShowOnboarding(false);
    showToast.success(t('shell.onboardingWelcomeToast'));
  };

  const handleSkip = () => {
    setShowOnboarding(false);
    showToast.info(t('shell.onboardingSkipToast'));
  };

  return (
    <AnimatePresence>
      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </AnimatePresence>
  );
}
