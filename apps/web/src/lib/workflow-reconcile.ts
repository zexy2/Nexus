import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { agentExecutions } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/production-guardrails";

type AgentExecutionRow = typeof agentExecutions.$inferSelect;

type TemporalStatusResult = {
  workflowId: string;
  runId?: string;
  status: string;
  result?: unknown;
  error?: string;
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

type ExecutionStatus = "running" | "completed" | "failed";

/**
 * Temporal `WorkflowExecutionStatusName` -> agent_executions.status.
 * agent_executions only models running/completed/failed, so every closed
 * non-success state maps to "failed" (with a descriptive error message).
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
  CANCELLED: "failed",
  CANCELED: "failed",
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
export function temporalClosedStatusMessage(status: string): string | undefined {
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

export async function reconcileWorkflowExecution(
  execution: AgentExecutionRow,
  options: {
    userId?: string | null;
    request?: NextRequest;
  } = {}
): Promise<AgentExecutionRow> {
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
      const terminalStatus = normalizeTemporalStatus(terminalResult.status);
      const terminalOutput = resultToOutput(terminalResult.result);

      output = terminalOutput ?? output;
      errorMessage = terminalResult.error || errorMessage;

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
          event: terminalStatus === "completed" ? "workflow.complete" : "workflow.failed",
          status: terminalStatus === "completed" ? "success" : "failed",
          metadata: {
            workflowId: execution.temporalWorkflowId,
            executionId: execution.id,
            error: errorMessage,
          },
          request: options.request,
        });

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

      return updated || { ...execution, status, errorMessage };
    }

    return execution;
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
