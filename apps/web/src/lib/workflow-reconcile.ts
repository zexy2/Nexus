import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { agentExecutions, changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/production-guardrails";
import { resolveOrphanedChangeSet } from "@/lib/change-set-recovery";
import {
  createNotification,
  resolveExecutionOwner,
  workflowTypeOf,
  type NotificationType,
} from "@/lib/notifications";

type AgentExecutionRow = typeof agentExecutions.$inferSelect;

type PendingActivity = { activityType: string; attempt: number };

type TemporalStatusResult = {
  workflowId: string;
  runId?: string;
  status: string;
  result?: unknown;
  error?: string;
  pendingActivities?: PendingActivity[];
};

type TemporalResult = {
  workflowId: string;
  runId?: string;
  status: string;
  result?: unknown;
  error?: string;
};

type WorkflowClient = {
  createTemporalClient: () => Promise<unknown>;
  getWorkflowStatus: (workflowId: string) => Promise<TemporalStatusResult>;
  getWorkflowResult: <TOutput = unknown>(workflowId: string) => Promise<TemporalResult & { result?: TOutput }>;
};

type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

/**
 * Temporal `WorkflowExecutionStatusName` -> agent_executions.status.
 * A user cancel closes as CANCELLED and is shown as such; the other closed
 * non-success states map to "failed" (with a descriptive error message).
 * CONTINUED_AS_NEW is not terminal: the handle follows the new run.
 */
const TEMPORAL_STATUS_MAP: Record<string, ExecutionStatus> = {
  RUNNING: "running",
  CONTINUED_AS_NEW: "running",
  PAUSED: "running",
  UNSPECIFIED: "running",
  UNKNOWN: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  CANCELED: "cancelled",
  TERMINATED: "failed",
  TIMED_OUT: "failed",
};

const TEMPORAL_CLOSED_FAILURE_MESSAGES: Record<string, string> = {
  CANCELLED: "Workflow was cancelled",
  CANCELED: "Workflow was cancelled",
  TERMINATED: "Workflow was terminated",
  TIMED_OUT: "Workflow timed out",
};

function temporalStatusKey(status: string) {
  return status.trim().toUpperCase().replace(/^WORKFLOW_EXECUTION_STATUS_/, "");
}

export function normalizeTemporalStatus(status: string): ExecutionStatus {
  return TEMPORAL_STATUS_MAP[temporalStatusKey(status)] ?? "running";
}

/** Default error for closed non-success states that carry no failure message. */
function temporalClosedStatusMessage(status: string): string | undefined {
  return TEMPORAL_CLOSED_FAILURE_MESSAGES[temporalStatusKey(status)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resultToOutput(result: unknown): Record<string, unknown> | null {
  if (isRecord(result)) return result;
  if (result === undefined || result === null) return null;
  return { result };
}

export function extractWorkflowSteps(output: unknown): unknown[] {
  if (!isRecord(output)) return [];
  if (Array.isArray(output.steps)) return output.steps;
  if (isRecord(output.result) && Array.isArray(output.result.steps)) return output.result.steps;
  return [];
}

/**
 * Live phase of a running workflow. Derived only from real signals: the
 * activity Temporal reports in flight, or a pending plan review. There is no
 * percentage because the workflows do not report one.
 */
export type WorkflowPhase =
  | "searching"
  | "researching"
  | "writing"
  | "planning"
  | "coding"
  | "analyzing"
  | "saving"
  | "applying"
  | "externalWrites"
  | "awaitingReview"
  | "cancelling";

export type WorkflowProgress = {
  phase: WorkflowPhase | null;
  /** Retry attempt of the in-flight activity (1 = first try). */
  attempt: number;
  changeSetId?: string;
};

export type ReconciledExecution = AgentExecutionRow & { progress?: WorkflowProgress };

const PHASE_BY_ACTIVITY: Record<string, WorkflowPhase> = {
  searchDocuments: "searching",
  callResearchAgent: "researching",
  callWriterAgent: "writing",
  callTaskAgent: "planning",
  callCoderAgent: "coding",
  analyzePlanImpact: "analyzing",
  persistPlanImpact: "saving",
  saveDocument: "saving",
  saveTasks: "saving",
  applyPlanChangeSet: "applying",
  executeExternalWriteOperation: "externalWrites",
  syncGitHubIntegrationAfterExternalWrite: "externalWrites",
  finalizeExternalWriteOperations: "externalWrites",
  listRunnableExternalWriteOperationIds: "externalWrites",
  cancelPlanImpactRun: "cancelling",
};

export function phaseFromPendingActivities(
  pending: PendingActivity[] = []
): { phase: WorkflowPhase | null; attempt: number } {
  // sendNotification is bookkeeping, not a phase.
  for (const activity of pending) {
    const phase = PHASE_BY_ACTIVITY[activity.activityType];
    if (phase) return { phase, attempt: activity.attempt || 1 };
  }
  return { phase: null, attempt: 1 };
}

async function pendingChangeSetForWorkflow(workflowId: string) {
  return db.query.changeSets.findFirst({
    where: and(eq(changeSets.temporalWorkflowId, workflowId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });
}

const NOTIFICATION_BY_STATUS: Record<Exclude<ExecutionStatus, "running">, NotificationType> = {
  completed: "workflow_completed",
  failed: "workflow_failed",
  cancelled: "workflow_cancelled",
};

function notificationData(execution: AgentExecutionRow) {
  return {
    executionId: execution.id,
    workflowId: execution.temporalWorkflowId,
    workflowType: workflowTypeOf(execution),
    docId: typeof execution.input?.docId === "string" ? execution.input.docId : null,
    title: typeof execution.input?.title === "string" ? execution.input.title.slice(0, 120) : null,
  };
}

async function notifyTerminalTransition(execution: AgentExecutionRow) {
  const type = NOTIFICATION_BY_STATUS[execution.status as Exclude<ExecutionStatus, "running">];
  if (!type) return;
  const ownerId = await resolveExecutionOwner(execution);
  if (!ownerId) return;
  await createNotification({
    userId: ownerId,
    workspaceId: execution.workspaceId,
    type,
    dedupeKey: `workflow:${execution.id}:${execution.status}`,
    data: notificationData(execution),
  });
}

async function notifyReviewPending(execution: AgentExecutionRow, changeSetId: string) {
  const ownerId = await resolveExecutionOwner(execution);
  if (!ownerId) return;
  await createNotification({
    userId: ownerId,
    workspaceId: execution.workspaceId,
    type: "plan_review_pending",
    dedupeKey: `plan_review:${changeSetId}`,
    data: { ...notificationData(execution), changeSetId },
  });
}

/**
 * A cancelled plan-impact run must not leave its review pending. The workflow
 * cleans up itself (cancelPlanImpactRun); this covers a persist activity that
 * committed after that cleanup, and runs cancelled by older worker code.
 */
async function releaseCancelledPlanReview(execution: AgentExecutionRow, userId: string | null) {
  if (!execution.temporalWorkflowId || workflowTypeOf(execution) !== "plan_impact") return;
  try {
    const pending = await pendingChangeSetForWorkflow(execution.temporalWorkflowId);
    if (pending) {
      await resolveOrphanedChangeSet(pending.id, "cancelled", userId, "workflow_cancelled");
    }
  } catch (error) {
    console.error("[Workflows] Cancelled plan review cleanup failed:", error);
  }
}

async function attachProgress(
  execution: AgentExecutionRow,
  temporalStatus: TemporalStatusResult
): Promise<ReconciledExecution> {
  const { phase, attempt } = phaseFromPendingActivities(temporalStatus.pendingActivities);
  if (phase || workflowTypeOf(execution) !== "plan_impact" || !execution.temporalWorkflowId) {
    return { ...execution, progress: { phase, attempt } };
  }

  // No activity in flight: a plan-impact run is then parked on its review.
  try {
    const pending = await pendingChangeSetForWorkflow(execution.temporalWorkflowId);
    if (pending) {
      await notifyReviewPending(execution, pending.id);
      return { ...execution, progress: { phase: "awaitingReview", attempt: 1, changeSetId: pending.id } };
    }
  } catch (error) {
    console.error("[Workflows] Review lookup failed:", error);
  }
  return { ...execution, progress: { phase: null, attempt: 1 } };
}

export async function reconcileWorkflowExecution(
  execution: AgentExecutionRow,
  options: {
    userId?: string | null;
    request?: NextRequest;
  } = {}
): Promise<ReconciledExecution> {
  if (!execution.temporalWorkflowId || execution.status !== "running") {
    return execution;
  }

  try {
    const temporalClient = (await import("@nexus/workflows/client")) as WorkflowClient;
    await temporalClient.createTemporalClient();

    const temporalStatus = await temporalClient.getWorkflowStatus(execution.temporalWorkflowId);
    const status = normalizeTemporalStatus(temporalStatus.status);

    let output = execution.output;
    let errorMessage =
      temporalStatus.error ||
      temporalClosedStatusMessage(temporalStatus.status) ||
      execution.errorMessage;

    if (status !== "running") {
      const terminalResult =
        status === "failed" && temporalStatus.error
          ? temporalStatus
          : await temporalClient.getWorkflowResult(execution.temporalWorkflowId);
      // handle.result() of a cancelled run rejects, which getWorkflowResult
      // reports as FAILED; the described CANCELLED status is authoritative.
      const terminalStatus =
        status === "cancelled" ? "cancelled" : normalizeTemporalStatus(terminalResult.status);
      const terminalOutput = resultToOutput(terminalResult.result);

      output = terminalOutput ?? output;
      errorMessage =
        terminalStatus === "cancelled"
          ? temporalClosedStatusMessage(temporalStatus.status) ?? null
          : terminalResult.error || errorMessage;

      const [updated] = await db
        .update(agentExecutions)
        .set({
          status: terminalStatus,
          output,
          errorMessage,
          completedAt: new Date(),
        })
        .where(and(eq(agentExecutions.id, execution.id), eq(agentExecutions.status, "running")))
        .returning();

      if (updated) {
        await writeAuditLog({
          userId: options.userId || null,
          workspaceId: execution.workspaceId,
          event:
            terminalStatus === "completed"
              ? "workflow.complete"
              : terminalStatus === "cancelled"
                ? "workflow.cancelled"
                : "workflow.failed",
          status: terminalStatus === "failed" ? "failed" : "success",
          metadata: {
            workflowId: execution.temporalWorkflowId,
            executionId: execution.id,
            error: errorMessage,
          },
          request: options.request,
        });

        if (terminalStatus === "cancelled") {
          await releaseCancelledPlanReview(updated, options.userId ?? null);
        }
        // Only the request that won the guarded UPDATE notifies.
        await notifyTerminalTransition(updated);

        return updated;
      }

      const current = await db.query.agentExecutions.findFirst({
        where: eq(agentExecutions.id, execution.id),
      });

      return current || {
        ...execution,
        status: terminalStatus,
        output,
        errorMessage,
        completedAt: new Date(),
      };
    }

    if (status !== execution.status || errorMessage !== execution.errorMessage) {
      const [updated] = await db
        .update(agentExecutions)
        .set({
          status,
          errorMessage,
        })
        .where(eq(agentExecutions.id, execution.id))
        .returning();

      return attachProgress(updated || { ...execution, status, errorMessage }, temporalStatus);
    }

    return attachProgress(execution, temporalStatus);
  } catch (error) {
    console.error("[Workflows] Reconcile failed:", error);
    return execution;
  }
}

export async function reconcileRunningWorkflowExecutions(
  executions: AgentExecutionRow[],
  options: {
    userId?: string | null;
    request?: NextRequest;
  } = {}
) {
  return Promise.all(executions.map((execution) => reconcileWorkflowExecution(execution, options)));
}
