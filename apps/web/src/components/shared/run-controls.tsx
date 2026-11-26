"use client";

import { useState } from "react";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { showToast } from "@/components/shared/toast-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Mirrors WorkflowProgress from lib/workflow-reconcile (server). */
export type RunProgress = {
  phase: string | null;
  attempt: number;
  changeSetId?: string;
} | null | undefined;

const KNOWN_PHASES = new Set([
  "searching",
  "researching",
  "writing",
  "planning",
  "coding",
  "analyzing",
  "saving",
  "applying",
  "externalWrites",
  "awaitingReview",
  "cancelling",
]);

/** Display name for a run's public workflow type. */
export function runTypeLabel(workflowType: unknown, t: (path: string) => string): string {
  if (workflowType === "plan_impact") return t("agents.center.runPlanImpact");
  if (workflowType === "document") return t("agents.center.runPlanGeneration");
  if (workflowType === "research") return t("agents.center.runResearch");
  if (workflowType === "tasks") return t("agents.center.runTaskBreakdown");
  if (workflowType === "code") return t("agents.center.runCodeGeneration");
  return t("notifications.workflowFallback");
}

/**
 * Current phase of a running workflow, as reported by the server. Renders
 * nothing when there is no real signal (no invented progress).
 */
export function RunPhase({
  progress,
  cancelRequested,
  className,
}: {
  progress: RunProgress;
  cancelRequested?: boolean;
  className?: string;
}) {
  const t = useT();
  const phase = cancelRequested ? "cancelling" : progress?.phase;
  if (!phase || !KNOWN_PHASES.has(phase)) return null;
  const attempt = !cancelRequested && progress && progress.attempt > 1 ? progress.attempt : null;
  return (
    <span className={cn("text-xs text-foreground-subtle", className)} data-testid="run-phase" aria-live="polite">
      {t(`runs.phase.${phase}`)}
      {attempt ? ` · ${t("runs.retryAttempt").replace("{n}", String(attempt))}` : null}
    </span>
  );
}

/**
 * Cancel button for a running workflow. Confirms first; the request is
 * idempotent server-side and the button stays disabled while a cancel is in
 * flight or already requested, so double clicks are harmless.
 */
export function RunCancelButton({
  workflowId,
  cancelRequested = false,
  onCancelRequested,
  size = "sm",
  className,
}: {
  workflowId: string;
  cancelRequested?: boolean;
  onCancelRequested?: () => void;
  size?: "sm" | "default";
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const pending = cancelRequested || requested;

  const cancel = async () => {
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/cancel`, {
        method: "POST",
      });
      if (response.status === 202) {
        setRequested(true);
        showToast.info(t("runs.cancelRequested"));
        onCancelRequested?.();
        return;
      }
      if (response.status === 403) {
        showToast.error(t("runs.cancelForbidden"));
      } else if (response.status === 409) {
        showToast.info(t("runs.cancelAlreadyFinished"));
        onCancelRequested?.();
      } else {
        showToast.error(t("runs.cancelFailed"));
      }
    } catch {
      showToast.error(t("runs.cancelFailed"));
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        disabled={pending}
        onClick={() => setOpen(true)}
        data-testid="run-cancel-button"
        aria-label={t("runs.cancel")}
      >
        {pending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Square className="mr-1.5 size-3" />
        )}
        {pending ? t("runs.status.cancelling") : t("runs.cancelShort")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("runs.cancelConfirmTitle")}
        description={t("runs.cancelConfirmDesc")}
        confirmLabel={t("runs.cancel")}
        cancelLabel={t("runs.cancelKeep")}
        destructive
        onConfirm={cancel}
      />
    </>
  );
}
