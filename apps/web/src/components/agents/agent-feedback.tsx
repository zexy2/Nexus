"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Bot,
  Search,
  FileText,
  Code,
  CheckSquare,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type AgentType = "supervisor" | "researcher" | "writer" | "coder" | "task";
type AgentStatus = "pending" | "running" | "completed" | "failed";

interface AgentStep {
  id: string;
  agent: AgentType;
  status: AgentStatus;
  message?: string;
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
}

interface AgentExecutionFeedbackProps {
  steps: AgentStep[];
  isComplete: boolean;
  className?: string;
}

const agentConfig: Record<
  AgentType,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  supervisor: {
    icon: Bot,
    label: "Nexus",
    color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  },
  researcher: {
    icon: Search,
    label: "Araştırma",
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  writer: {
    icon: FileText,
    label: "Taslak oluşturma",
    color: "text-green-500 bg-green-500/10 border-green-500/20",
  },
  coder: {
    icon: Code,
    label: "Teknik çalışma",
    color: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  },
  task: {
    icon: CheckSquare,
    label: "İş kırılımı",
    color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  },
};

function StatusIcon({ status }: { status: AgentStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />;
  }
}

function AgentStepItem({
  step,
  isLast,
}: {
  step: AgentStep;
  isLast: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const config = agentConfig[step.agent];
  const Icon = config.icon;

  const duration =
    step.startedAt && step.completedAt
      ? Math.round(
          (step.completedAt.getTime() - step.startedAt.getTime()) / 1000
        )
      : null;

  return (
    <div className="relative" data-testid={`agent-step-${step.agent}`}>
      {/* Connector line */}
      {!isLast && (
        <div
          className={cn(
            "absolute left-5 top-10 h-full w-0.5",
            step.status === "completed"
              ? "bg-green-500/30"
              : step.status === "running"
              ? "bg-blue-500/30 animate-pulse"
              : "bg-muted"
          )}
        />
      )}

      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-3 transition-all",
          config.color,
          step.status === "running" && "ring-2 ring-blue-500/50"
        )}
      >
        {/* Agent icon */}
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            "bg-background border-2",
            step.status === "running" && "border-blue-500",
            step.status === "completed" && "border-green-500",
            step.status === "failed" && "border-red-500"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium">{config.label}</span>
              <StatusIcon status={step.status} />
            </div>
            {duration !== null && (
              <span className="text-xs text-muted-foreground">
                {duration}s
              </span>
            )}
          </div>

          {step.message && (
            <p className="mt-1 text-sm text-muted-foreground">{step.message}</p>
          )}

          {/* Expandable output */}
          {step.output && (
            <div className="mt-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Gizle
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Çıktıyı göster
                  </>
                )}
              </button>
              {isExpanded && (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {step.output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Agent Execution Feedback Component
 * Shows real-time progress of a workflow pipeline.
 */
export function AgentExecutionFeedback({
  steps,
  isComplete,
  className,
}: AgentExecutionFeedbackProps) {
  const runningStep = steps.find((s) => s.status === "running");
  const completedCount = steps.filter((s) => s.status === "completed").length;

  return (
    <div className={cn("space-y-3", className)} data-testid="agent-feedback">
      {/* Header with progress */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {!isComplete && runningStep && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-muted-foreground">
                {agentConfig[runningStep.agent].label} çalışıyor...
              </span>
            </>
          )}
          {isComplete && (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-green-600 dark:text-green-400">
                Tamamlandı
              </span>
            </>
          )}
        </div>
        <span className="text-muted-foreground">
          {completedCount}/{steps.length} adım
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-200",
            isComplete ? "bg-green-500" : "bg-blue-500"
          )}
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <AgentStepItem
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact agent indicator for chat messages
 */
export function AgentIndicator({
  agent,
  status,
}: {
  agent: AgentType;
  status: AgentStatus;
}) {
  const config = agentConfig[agent];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs",
        config.color
      )}
      data-testid="agent-indicator"
    >
      {status === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span>{config.label}</span>
    </div>
  );
}

/**
 * Typing indicator with agent context
 */
export function AgentTypingIndicator({ agent }: { agent?: AgentType }) {
  const config = agent ? agentConfig[agent] : null;

  return (
    <div
      className="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="typing-indicator"
    >
      <div className="flex gap-1">
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-2 w-2 rounded-full bg-current animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      {config && (
        <span>
          {config.label} düşünüyor...
        </span>
      )}
    </div>
  );
}

// Re-export types for external use
export type { AgentType, AgentStatus, AgentStep };
