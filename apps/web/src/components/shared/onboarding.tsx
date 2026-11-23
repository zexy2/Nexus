"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  MessageSquare,
  ListTodo,
  Zap,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Palette,
  Bell,
  Shield,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUserPreferences } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

// Step configuration
// Copy lives in messages.ts under onboarding.steps.<id>.{title,description}.
interface OnboardingStep {
  id: string;
  icon: typeof Sparkles;
  color: string;
}

const steps: OnboardingStep[] = [
  {
    id: "welcome",
    icon: Sparkles,
    color: "violet",
  },
  {
    id: "workspace",
    icon: FileText,
    color: "blue",
  },
  {
    id: "flow",
    icon: Zap,
    color: "emerald",
  },
  {
    id: "preferences",
    icon: Palette,
    color: "amber",
  },
  {
    id: "ready",
    icon: Rocket,
    color: "rose",
  },
];

// Copy: onboarding.controlPoints.<id>.{name,description}
const controlPoints = [
  {
    id: "version",
    icon: "01",
    color: "bg-white/10",
  },
  {
    id: "requirements",
    icon: "02",
    color: "bg-white/10",
  },
  {
    id: "impact",
    icon: "03",
    color: "bg-emerald-500/15",
  },
  {
    id: "approval",
    icon: "04",
    color: "bg-white/10",
  },
];

// Feature highlights (copy: onboarding.features.<id>.*)
const features = [
  {
    id: "plans",
    icon: FileText,
  },
  {
    id: "linked",
    icon: ListTodo,
  },
  {
    id: "approval",
    icon: Shield,
  },
  {
    id: "ask",
    icon: MessageSquare,
  },
];

interface OnboardingModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const t = useT();
  const [currentStep, setCurrentStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedControlPoints, setSelectedControlPoints] = useState<string[]>([
    "version",
    "impact",
  ]);
  
  const {
    setHasCompletedOnboarding,
    setAutoSave,
    setNotificationsEnabled,
    autoSave,
    notificationsEnabled,
  } = useUserPreferences();
  
  // Local state for AI suggestions since it's not in store
  const [aiSuggestionsEnabled, setAiSuggestionsEnabled] = useState(true);

  const step = steps[currentStep];

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setHasCompletedOnboarding(true);
      onComplete();
    }
  }, [currentStep, setHasCompletedOnboarding, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    setHasCompletedOnboarding(true);
    onSkip();
  }, [setHasCompletedOnboarding, onSkip]);

  const toggleControlPoint = useCallback((pointId: string) => {
    setSelectedControlPoints((prev) =>
      prev.includes(pointId)
        ? prev.filter((id) => id !== pointId)
        : [...prev, pointId]
    );
  }, []);

  // Animation variants
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  const colorClasses = {
    violet: {
      bg: "bg-white/10",
      text: "text-foreground",
      ring: "ring-white/40",
    },
    blue: {
      bg: "bg-white/10",
      text: "text-foreground",
      ring: "ring-white/40",
    },
    emerald: {
      bg: "bg-emerald-500/15",
      text: "text-emerald-400",
      ring: "ring-emerald-500",
    },
    amber: {
      bg: "bg-white/10",
      text: "text-foreground",
      ring: "ring-white/40",
    },
    rose: {
      bg: "bg-rose-100",
      text: "text-rose-600",
      ring: "ring-rose-500",
    },
  };

  const colors = colorClasses[step.color as keyof typeof colorClasses];
  const Icon = step.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-popover rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-white/[0.06] transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/[0.06]">
          <motion.div
            className="h-full bg-foreground"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Content */}
        <div className="p-8 pt-12">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, index) => (
              <div
                key={s.id}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === currentStep
                    ? "w-8 bg-foreground"
                    : index < currentStep
                    ? "bg-white/30"
                    : "bg-white/10"
                )}
              />
            ))}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait" custom={1}>
            <motion.div
              key={step.id}
              custom={1}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                  className={cn(
                    "w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center",
                    colors.bg
                  )}
                >
                  <Icon className={cn("w-8 h-8", colors.text)} />
                </motion.div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {t(`onboarding.steps.${step.id}.title`)}
                </h2>
                <p className="text-muted-foreground">{t(`onboarding.steps.${step.id}.description`)}</p>
              </div>

              {/* Step-specific content */}
              {step.id === "welcome" && (
                <div className="grid grid-cols-2 gap-4">
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.1 }}
                      className="p-4 bg-white/[0.04] rounded-xl border border-border"
                    >
                      <feature.icon className="w-6 h-6 text-muted-foreground mb-2" />
                      <h4 className="font-medium text-foreground mb-1">
                        {t(`onboarding.features.${feature.id}.title`)}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {t(`onboarding.features.${feature.id}.description`)}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}

              {step.id === "workspace" && (
                <div className="max-w-sm mx-auto space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-foreground">
                      {t("onboarding.workspaceName")}
                    </Label>
                    <Input
                      placeholder={t("onboarding.workspacePlaceholder")}
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="mt-1.5"
                      autoFocus
                    />
                  </div>
                  <div className="p-4 bg-white/[0.04] rounded-xl">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-foreground font-medium">
                          {t("onboarding.tipTitle")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t("onboarding.tipBody")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step.id === "flow" && (
                <div className="grid grid-cols-2 gap-3">
                  {controlPoints.map((point) => (
                    <motion.button
                      key={point.id}
                      onClick={() => toggleControlPoint(point.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        selectedControlPoints.includes(point.id)
                          ? "border-white/40 bg-popover/[0.06]"
                          : "border-border hover:border-white/20"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                            point.color
                          )}
                        >
                          {point.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-foreground">
                              {t(`onboarding.controlPoints.${point.id}.name`)}
                            </h4>
                            {selectedControlPoints.includes(point.id) && (
                              <Check className="w-4 h-4 text-foreground" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {t(`onboarding.controlPoints.${point.id}.description`)}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {step.id === "preferences" && (
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/[0.04] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{t("onboarding.aiSuggestions")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("onboarding.aiSuggestionsDesc")}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={aiSuggestionsEnabled}
                      onCheckedChange={setAiSuggestionsEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/[0.04] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{t("onboarding.autoSave")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("onboarding.autoSaveDesc")}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/[0.04] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{t("onboarding.notifications")}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("onboarding.notificationsDesc")}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={setNotificationsEnabled}
                    />
                  </div>
                </div>
              )}

              {step.id === "ready" && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 mx-auto mb-6 flex items-center justify-center"
                  >
                    <Check className="w-12 h-12 text-white" />
                  </motion.div>
                  <p className="text-muted-foreground mb-6">
                    {t("onboarding.readyBody")}
                  </p>
                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-400" />
                      {t("onboarding.workspaceCreated").replace(
                        "{name}",
                        workspaceName || t("onboarding.workspaceFallback")
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-400" />
                      {t("onboarding.controlPointsReady").replace(
                        "{n}",
                        String(selectedControlPoints.length)
                      )}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("onboarding.back")}
          </Button>

          <Button
            onClick={handleNext}
            className="bg-foreground hover:bg-foreground/90 text-white gap-2"
          >
            {currentStep === steps.length - 1 ? (
              <>
                {t("onboarding.start")}
                <Rocket className="w-4 h-4" />
              </>
            ) : (
              <>
                {t("onboarding.next")}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
