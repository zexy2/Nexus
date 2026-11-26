/**
 * Frozen copy of planImpactWorkflow as deployed before cancellation support
 * (origin/main @ 36c31b7). Used only by the replay tests: histories produced
 * by this code must replay on the current workflow code without a
 * nondeterminism error, which is what in-flight production executions do
 * after a worker deploy. Do not edit.
 */
import {
  ApplicationFailure,
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "../../activities";
import type { PlanChangeDecision, PlanImpactInput, PlanImpactOutput } from "../../types";

const {
  analyzePlanImpact,
  persistPlanImpact,
  applyPlanChangeSet,
  rejectPlanChangeSet,
  expirePlanChangeSet,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "3 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 7,
    maximumInterval: "60 seconds",
  },
});

const {
  executeExternalWriteOperation,
  syncGitHubIntegrationAfterExternalWrite,
  finalizeExternalWriteOperations,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "90 seconds",
  retry: {
    initialInterval: "5 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 5,
    maximumInterval: "2 minutes",
    nonRetryableErrorTypes: ["ExternalWriteTerminalError"],
  },
});

export const resolvePlanChangeSignal =
  defineSignal<[PlanChangeDecision]>("resolvePlanChange");

async function executeExternalWriteAndSync(operationId: string) {
  const result = await executeExternalWriteOperation(operationId);
  if (result.status === "succeeded") {
    await syncGitHubIntegrationAfterExternalWrite(operationId);
  }
  return result;
}

async function applyChangeSetAndExternalWrites(input: {
  changeSetId: string;
  selectedProposalIds: string[];
  userId: string;
}) {
  const applied = await applyPlanChangeSet(input.changeSetId, input.selectedProposalIds, input.userId);
  for (const operationId of applied.externalOperationIds) {
    try {
      await executeExternalWriteAndSync(operationId);
    } catch {
      // see workflows.ts
    }
  }
  const external = applied.externalOperationIds.length > 0
    ? await finalizeExternalWriteOperations(input.changeSetId, input.userId)
    : null;
  return { ...applied, external };
}

export async function planImpactWorkflow(input: PlanImpactInput): Promise<PlanImpactOutput> {
  const analysis = await analyzePlanImpact(input);
  const persisted = await persistPlanImpact(analysis, workflowInfo().workflowId);
  const resolution: { value: PlanChangeDecision | null } = { value: null };

  setHandler(resolvePlanChangeSignal, (decision) => {
    if (resolution.value) return;
    resolution.value = decision;
  });

  const resolved = await condition(() => resolution.value !== null, "72 hours");
  if (!resolved) {
    await expirePlanChangeSet(persisted.changeSetId, input.userId);
    return {
      changeSetId: persisted.changeSetId,
      docId: input.docId,
      versionNumber: persisted.versionNumber,
      decision: "expired",
      summary: persisted.summary,
      stats: persisted.stats,
      steps: persisted.steps,
    };
  }

  const decision = resolution.value;
  if (!decision) {
    throw ApplicationFailure.nonRetryable("Plan change resolution was not recorded", "WorkflowStateError");
  }

  if (decision.decision === "reject") {
    await rejectPlanChangeSet(persisted.changeSetId, decision.userId);
    return {
      changeSetId: persisted.changeSetId,
      docId: input.docId,
      versionNumber: persisted.versionNumber,
      decision: "rejected",
      summary: persisted.summary,
      stats: persisted.stats,
      steps: persisted.steps,
    };
  }

  const applied = await applyChangeSetAndExternalWrites({
    changeSetId: persisted.changeSetId,
    selectedProposalIds: decision.selectedProposalIds || [],
    userId: decision.userId,
  });

  return {
    changeSetId: persisted.changeSetId,
    docId: input.docId,
    versionNumber: persisted.versionNumber,
    decision: "applied",
    summary: persisted.summary,
    stats: persisted.stats,
    applied,
    steps: persisted.steps,
  };
}
