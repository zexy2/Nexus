"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Wand2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  X,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface FloatingAIWidgetProps {
  isVisible: boolean;
  selectedText: string;
  selectionRect: DOMRect | null;
  onAction: (action: string, customPrompt?: string) => void;
  onClose: () => void;
}

const quickActions = [
  {
    id: "grammar",
    label: "Fix Grammar",
    icon: Check,
    description: "Correct spelling and grammar",
  },
  {
    id: "shorten",
    label: "Shorten",
    icon: ArrowDownToLine,
    description: "Make it more concise",
  },
  {
    id: "expand",
    label: "Expand",
    icon: ArrowUpFromLine,
    description: "Add more detail",
  },
  {
    id: "improve",
    label: "Improve",
    icon: Wand2,
    description: "Enhance writing quality",
  },
];

export function FloatingAIWidget({
  isVisible,
  selectedText,
  selectionRect,
  onAction,
  onClose,
}: FloatingAIWidgetProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Position the widget below the selection
  const getPosition = () => {
    if (!selectionRect) return { top: 0, left: 0 };
    return {
      top: selectionRect.bottom + 10,
      left: Math.max(20, selectionRect.left + selectionRect.width / 2 - 180),
    };
  };

  const handleAction = async (actionId: string) => {
    setActiveAction(actionId);
    setIsProcessing(true);
    
    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    onAction(actionId);
    setIsProcessing(false);
    setActiveAction(null);
    onClose();
  };

  const handleCustomPrompt = async () => {
    if (!customPrompt.trim()) return;
    
    setIsProcessing(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    onAction("custom", customPrompt);
    setCustomPrompt("");
    setIsProcessing(false);
    setShowInput(false);
    onClose();
  };

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showInput) {
          setShowInput(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showInput, onClose]);

  const position = getPosition();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed z-50"
          style={{ top: position.top, left: position.left }}
        >
          <div
            className={cn(
              "bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl",
              "shadow-2xl shadow-black/50",
              "overflow-hidden",
              "min-w-[360px]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                </div>
                <span className="text-sm font-medium text-white">AI Edit</span>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-md hover:bg-white/5 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {/* Selected Text Preview */}
            {selectedText && (
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <p className="text-xs text-zinc-500 mb-1">Selected text:</p>
                <p className="text-sm text-zinc-300 line-clamp-2 font-serif italic">
                  &quot;{selectedText.slice(0, 100)}
                  {selectedText.length > 100 ? "..." : ""}&quot;
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="p-2">
              <div className="grid grid-cols-2 gap-1.5">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  const isActive = activeAction === action.id;
                  
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action.id)}
                      disabled={isProcessing}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg",
                        "text-left transition-all duration-150",
                        "hover:bg-white/5 active:scale-[0.98]",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        isActive && "bg-violet-500/20 border border-violet-500/30"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          "bg-white/5",
                          isActive && "bg-violet-500/30"
                        )}
                      >
                        {isActive && isProcessing ? (
                          <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                        ) : (
                          <Icon
                            className={cn(
                              "w-4 h-4",
                              isActive ? "text-violet-400" : "text-zinc-400"
                            )}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            isActive ? "text-violet-300" : "text-white"
                          )}
                        >
                          {action.label}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">
                          {action.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Prompt Input */}
            <div className="px-4 pb-4">
              <AnimatePresence mode="wait">
                {showInput ? (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="relative">
                      <input
                        ref={inputRef}
                        type="text"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleCustomPrompt();
                          }
                        }}
                        placeholder="Ask AI to edit..."
                        className={cn(
                          "w-full px-4 py-3 pr-12",
                          "bg-white/5 border border-white/10 rounded-xl",
                          "text-sm text-white placeholder:text-zinc-500",
                          "focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20",
                          "transition-all"
                        )}
                      />
                      <button
                        onClick={handleCustomPrompt}
                        disabled={!customPrompt.trim() || isProcessing}
                        className={cn(
                          "absolute right-2 top-1/2 -translate-y-1/2",
                          "w-8 h-8 rounded-lg",
                          "flex items-center justify-center",
                          "bg-violet-500 hover:bg-violet-600",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          "transition-colors"
                        )}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="toggle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowInput(true)}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-3",
                      "bg-white/5 hover:bg-white/10 border border-white/5",
                      "rounded-xl text-sm text-zinc-400",
                      "transition-colors"
                    )}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Ask AI to edit...</span>
                    <span className="ml-auto text-xs text-zinc-600 font-mono">
                      ⌘ + Enter
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Processing Overlay */}
            <AnimatePresence>
              {isProcessing && !activeAction && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm flex items-center justify-center"
                >
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                    <span className="text-sm text-white">Processing...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
