"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingModal } from "@/components/shared";
import { useUserPreferences } from "@/lib/store";
import { showToast } from "@/components/shared/toast-provider";

export function OnboardingWrapper() {
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
    showToast.success("Hoş geldiniz! Nexus'u keşfetmeye başlayın.");
  };

  const handleSkip = () => {
    setShowOnboarding(false);
    showToast.info("Daha sonra Ayarlar'dan onboarding'i tamamlayabilirsiniz.");
  };

  return (
    <AnimatePresence>
      {showOnboarding && (
        <OnboardingModal onComplete={handleComplete} onSkip={handleSkip} />
      )}
    </AnimatePresence>
  );
}
