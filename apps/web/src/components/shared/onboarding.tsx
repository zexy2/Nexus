"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  MessageSquare,
  ListTodo,
  Users,
  Zap,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Bot,
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

// Step configuration
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  color: string;
}

const steps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Nexus'a Hoş Geldiniz",
    description: "AI destekli üretkenlik aracınız",
    icon: Sparkles,
    color: "violet",
  },
  {
    id: "workspace",
    title: "Çalışma Alanınızı Oluşturun",
    description: "Projeniz için bir isim belirleyin",
    icon: FileText,
    color: "blue",
  },
  {
    id: "agents",
    title: "AI Ajanlarıyla Tanışın",
    description: "Size yardımcı olacak güçlü AI ajanları",
    icon: Bot,
    color: "emerald",
  },
  {
    id: "preferences",
    title: "Tercihlerinizi Ayarlayın",
    description: "Deneyiminizi kişiselleştirin",
    icon: Palette,
    color: "amber",
  },
  {
    id: "ready",
    title: "Hazırsınız!",
    description: "Üretkenliğinizi artırmaya başlayın",
    icon: Rocket,
    color: "rose",
  },
];

// AI Agent cards
const aiAgents = [
  {
    id: "research",
    name: "Araştırma Ajanı",
    description: "Web'de araştırma yapar ve bilgi toplar",
    icon: "🔍",
    color: "bg-blue-100",
  },
  {
    id: "writer",
    name: "Yazı Ajanı",
    description: "İçerik oluşturur ve düzenler",
    icon: "✍️",
    color: "bg-violet-100",
  },
  {
    id: "coder",
    name: "Kod Ajanı",
    description: "Kod yazar ve hataları düzeltir",
    icon: "💻",
    color: "bg-emerald-100",
  },
  {
    id: "planner",
    name: "Planlama Ajanı",
    description: "Görevleri organize eder ve planlar",
    icon: "📋",
    color: "bg-amber-100",
  },
];

// Feature highlights
const features = [
  {
    icon: FileText,
    title: "Akıllı Dökümanlar",
    description: "AI destekli döküman oluşturma",
  },
  {
    icon: MessageSquare,
    title: "AI Sohbet",
    description: "Ajanlarla gerçek zamanlı iletişim",
  },
  {
    icon: ListTodo,
    title: "Görev Yönetimi",
    description: "Kanban board ile organize olun",
  },
  {
    icon: Users,
    title: "Takım Çalışması",
    description: "Ekibinizle işbirliği yapın",
  },
];

interface OnboardingModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["research", "writer"]);
  
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

  const toggleAgent = useCallback((agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
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
      bg: "bg-violet-100",
      text: "text-violet-600",
      ring: "ring-violet-500",
    },
    blue: {
      bg: "bg-blue-100",
      text: "text-blue-600",
      ring: "ring-blue-500",
    },
    emerald: {
      bg: "bg-emerald-100",
      text: "text-emerald-600",
      ring: "ring-emerald-500",
    },
    amber: {
      bg: "bg-amber-100",
      text: "text-amber-600",
      ring: "ring-amber-500",
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-neutral-100 transition-colors"
        >
          <X className="w-5 h-5 text-neutral-400" />
        </button>

        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-100">
          <motion.div
            className="h-full bg-neutral-900"
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
                    ? "w-8 bg-neutral-900"
                    : index < currentStep
                    ? "bg-neutral-400"
                    : "bg-neutral-200"
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
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                  {step.title}
                </h2>
                <p className="text-neutral-500">{step.description}</p>
              </div>

              {/* Step-specific content */}
              {step.id === "welcome" && (
                <div className="grid grid-cols-2 gap-4">
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.1 }}
                      className="p-4 bg-neutral-50 rounded-xl border border-neutral-100"
                    >
                      <feature.icon className="w-6 h-6 text-neutral-600 mb-2" />
                      <h4 className="font-medium text-neutral-900 mb-1">
                        {feature.title}
                      </h4>
                      <p className="text-sm text-neutral-500">
                        {feature.description}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}

              {step.id === "workspace" && (
                <div className="max-w-sm mx-auto space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-neutral-700">
                      Çalışma Alanı Adı
                    </Label>
                    <Input
                      placeholder="Örn: Projem"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      className="mt-1.5"
                      autoFocus
                    />
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="text-sm text-blue-900 font-medium">
                          İpucu
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          Çalışma alanı adını proje veya takımınıza göre belirleyin.
                          Daha sonra değiştirebilirsiniz.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step.id === "agents" && (
                <div className="grid grid-cols-2 gap-3">
                  {aiAgents.map((agent) => (
                    <motion.button
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        selectedAgents.includes(agent.id)
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-neutral-200 hover:border-neutral-300"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                            agent.color
                          )}
                        >
                          {agent.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-neutral-900">
                              {agent.name}
                            </h4>
                            {selectedAgents.includes(agent.id) && (
                              <Check className="w-4 h-4 text-neutral-900" />
                            )}
                          </div>
                          <p className="text-sm text-neutral-500 mt-0.5">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {step.id === "preferences" && (
                <div className="max-w-sm mx-auto space-y-4">
                  <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-violet-600" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900">AI Önerileri</p>
                        <p className="text-sm text-neutral-500">
                          Akıllı yazma önerileri al
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={aiSuggestionsEnabled}
                      onCheckedChange={setAiSuggestionsEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900">Otomatik Kayıt</p>
                        <p className="text-sm text-neutral-500">
                          Değişiklikleri otomatik kaydet
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={autoSave}
                      onCheckedChange={setAutoSave}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium text-neutral-900">Bildirimler</p>
                        <p className="text-sm text-neutral-500">
                          Görev hatırlatıcıları al
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
                  <p className="text-neutral-600 mb-6">
                    Tüm ayarlarınız kaydedildi. Şimdi Nexus&apos;un gücünü keşfetmeye
                    başlayabilirsiniz!
                  </p>
                  <div className="flex items-center justify-center gap-4 text-sm text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-500" />
                      {workspaceName || "Çalışma Alanı"} oluşturuldu
                    </span>
                    <span className="flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-500" />
                      {selectedAgents.length} ajan seçildi
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
            Geri
          </Button>

          <Button
            onClick={handleNext}
            className="bg-neutral-900 hover:bg-neutral-800 text-white gap-2"
          >
            {currentStep === steps.length - 1 ? (
              <>
                Başla
                <Rocket className="w-4 h-4" />
              </>
            ) : (
              <>
                Devam
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Quick Tour Tooltip component
interface QuickTourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const tourSteps: QuickTourStep[] = [
  {
    target: "[data-tour='sidebar']",
    title: "Navigasyon",
    description: "Ana menüden tüm bölümlere erişin",
    position: "right",
  },
  {
    target: "[data-tour='documents']",
    title: "Dökümanlar",
    description: "Tüm dökümanlarınızı burada yönetin",
    position: "bottom",
  },
  {
    target: "[data-tour='chat']",
    title: "AI Sohbet",
    description: "AI ajanlarıyla gerçek zamanlı iletişim kurun",
    position: "bottom",
  },
  {
    target: "[data-tour='tasks']",
    title: "Görevler",
    description: "Kanban board ile görevlerinizi organize edin",
    position: "bottom",
  },
];

interface QuickTourTooltipProps {
  step: QuickTourStep;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

export function QuickTourTooltip({
  step,
  currentStep,
  totalSteps,
  onNext,
  onSkip,
}: QuickTourTooltipProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const target = document.querySelector(step.target);
    const timer = window.setTimeout(() => {
      setTargetRect(target ? target.getBoundingClientRect() : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [step.target]);

  if (!targetRect) return null;

  const positionStyles = {
    top: {
      top: targetRect.top - 10,
      left: targetRect.left + targetRect.width / 2,
      transform: "translate(-50%, -100%)",
    },
    bottom: {
      top: targetRect.bottom + 10,
      left: targetRect.left + targetRect.width / 2,
      transform: "translate(-50%, 0)",
    },
    left: {
      top: targetRect.top + targetRect.height / 2,
      left: targetRect.left - 10,
      transform: "translate(-100%, -50%)",
    },
    right: {
      top: targetRect.top + targetRect.height / 2,
      left: targetRect.right + 10,
      transform: "translate(0, -50%)",
    },
  };

  return (
    <>
      {/* Highlight overlay */}
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div
          className="absolute bg-neutral-900/50"
          style={{
            top: 0,
            left: 0,
            right: 0,
            height: targetRect.top - 4,
          }}
        />
        <div
          className="absolute bg-neutral-900/50"
          style={{
            top: targetRect.bottom + 4,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        <div
          className="absolute bg-neutral-900/50"
          style={{
            top: targetRect.top - 4,
            left: 0,
            width: targetRect.left - 4,
            height: targetRect.height + 8,
          }}
        />
        <div
          className="absolute bg-neutral-900/50"
          style={{
            top: targetRect.top - 4,
            left: targetRect.right + 4,
            right: 0,
            height: targetRect.height + 8,
          }}
        />
      </div>

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed z-50 w-72 bg-white rounded-xl shadow-2xl p-4"
        style={positionStyles[step.position]}
      >
        <h4 className="font-semibold text-neutral-900 mb-1">{step.title}</h4>
        <p className="text-sm text-neutral-500 mb-4">{step.description}</p>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            {currentStep + 1} / {totalSteps}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Atla
            </Button>
            <Button
              size="sm"
              onClick={onNext}
              className="bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              {currentStep === totalSteps - 1 ? "Bitti" : "İleri"}
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

// Export tour steps for use in app
export { tourSteps };
export type { QuickTourStep };
