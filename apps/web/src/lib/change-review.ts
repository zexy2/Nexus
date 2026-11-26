/**
 * Pure helpers for the change-set review screen.
 */

type OutcomeOperation = {
  provider: string;
  status: string;
  syncStatus?: string | null;
  error: string | null;
  syncError?: string | null;
};

export type OutcomeProposal = {
  id: string;
  title: string;
  action: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  externalOperations?: OutcomeOperation[];
};

export type FailedProposal = {
  id: string;
  title: string;
  provider: string | null;
  /** Friendly reason code; the UI maps it to copy. */
  reason: "integration_missing" | "permission" | "interrupted" | "provider_error";
  /** Raw provider error, shown as secondary detail. */
  detail: string | null;
};

export type ChangeSetOutcome = {
  applied: number;
  /** Selected but not applied because an external write failed. */
  failed: FailedProposal[];
  /** Left unselected by the reviewer (status "rejected" after apply). */
  unselected: number;
  /** Applied as a no-op against read-only demo sample data. */
  simulated: number;
};

const FAILED_STATUSES = new Set(["failed_retryable", "failed_terminal", "external_failed"]);

export function isSimulatedProposal(proposal: { metadata?: Record<string, unknown> | null }) {
  return proposal.metadata?.simulated === true;
}

function providerOf(proposal: OutcomeProposal): string | null {
  const fromMetadata = proposal.metadata?.externalProvider;
  if (typeof fromMetadata === "string") return fromMetadata;
  if (proposal.action.startsWith("github_")) return "github";
  if (proposal.action.startsWith("linear_")) return "linear";
  return proposal.externalOperations?.[0]?.provider ?? null;
}

export function classifyExternalError(message: string | null): FailedProposal["reason"] {
  const text = (message || "").toLowerCase();
  if (/installation is missing|not connected|no .* integration|token .*missing|credentials/.test(text)) {
    return "integration_missing";
  }
  if (/forbidden|permission|403|not authorized|unauthorized|401/.test(text)) return "permission";
  if (/interrupted/.test(text)) return "interrupted";
  return "provider_error";
}

/** Strips worker prefixes such as "Terminal failure: " from provider errors. */
export function cleanExternalError(message: string | null): string | null {
  if (!message) return null;
  return message.replace(/^(terminal failure|retryable failure|error):\s*/i, "").trim() || null;
}

/**
 * What actually happened to a resolved change set, from its proposals. The
 * change-set status alone cannot tell "the reviewer left items unselected"
 * apart from "a selected external write failed" (both end partially_applied).
 */
export function summarizeChangeSetOutcome(proposals: OutcomeProposal[]): ChangeSetOutcome {
  const outcome: ChangeSetOutcome = { applied: 0, failed: [], unselected: 0, simulated: 0 };

  for (const proposal of proposals) {
    const operations = proposal.externalOperations || [];
    const failedOperation = operations.find(
      (operation) =>
        FAILED_STATUSES.has(operation.status) ||
        (operation.status === "succeeded" && FAILED_STATUSES.has(operation.syncStatus || ""))
    );

    if (FAILED_STATUSES.has(proposal.status) || failedOperation) {
      const raw = failedOperation ? failedOperation.error || failedOperation.syncError || null : null;
      outcome.failed.push({
        id: proposal.id,
        title: proposal.title,
        provider: providerOf(proposal),
        reason: classifyExternalError(raw),
        detail: cleanExternalError(raw),
      });
      continue;
    }

    if (proposal.status === "rejected") {
      outcome.unselected += 1;
      continue;
    }

    if (proposal.status === "applied") {
      outcome.applied += 1;
      if (isSimulatedProposal(proposal)) outcome.simulated += 1;
    }
  }

  return outcome;
}

export type ConfidenceBand = "high" | "medium" | "low";

/**
 * Model-reported confidence is self-assessed, not calibrated: Gemini returns
 * 100 for almost everything, and our own rule-based proposals use fixed
 * numbers. A percentage suggests precision that does not exist, so the UI
 * shows a coarse band instead, and hides it entirely when every proposal in
 * the set falls into the same band (no signal to compare on).
 */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 85) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

export function confidenceIsInformative(values: number[]): boolean {
  return new Set(values.map(confidenceBand)).size > 1;
}
