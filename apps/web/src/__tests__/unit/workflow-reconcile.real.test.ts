/**
 * Temporal execution status -> agent_executions.status mapping.
 *
 * Temporal reports CANCELLED (double L) and TIMED_OUT; neither may be left
 * as "running", or the execution never reaches a terminal state.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSet = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return {
          where: () => ({
            returning: async () => [{ id: "exec-1", ...(values as object) }],
          }),
        };
      },
    }),
    query: { agentExecutions: { findFirst: vi.fn() } },
  },
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const getWorkflowStatus = vi.fn();
const getWorkflowResult = vi.fn();
vi.mock("@nexus/workflows/client", () => ({
  createTemporalClient: async () => ({}),
  getWorkflowStatus: (...args: unknown[]) => getWorkflowStatus(...args),
  getWorkflowResult: (...args: unknown[]) => getWorkflowResult(...args),
}));

import {
  normalizeTemporalStatus,
  reconcileWorkflowExecution,
} from "@/lib/workflow-reconcile";

describe("status mapping table", () => {
  it.each([
    ["RUNNING", "running"],
    ["CONTINUED_AS_NEW", "running"],
    ["UNSPECIFIED", "running"],
    ["COMPLETED", "completed"],
    ["FAILED", "failed"],
    ["CANCELLED", "failed"],
    ["TERMINATED", "failed"],
    ["TIMED_OUT", "failed"],
    ["WORKFLOW_EXECUTION_STATUS_TIMED_OUT", "failed"],
    ["cancelled", "failed"],
    ["something-new", "running"],
  ])("%s -> %s", (temporal, expected) => {
    expect(normalizeTemporalStatus(temporal)).toBe(expected);
  });
});

describe("reconcileWorkflowExecution", () => {
  const execution = {
    id: "exec-1",
    workspaceId: "ws-1",
    temporalWorkflowId: "wf-1",
    status: "running",
    output: null,
    errorMessage: null,
  } as unknown as Parameters<typeof reconcileWorkflowExecution>[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["CANCELLED", "Workflow was cancelled"],
    ["TIMED_OUT", "Workflow timed out"],
    ["TERMINATED", "Workflow was terminated"],
  ])("moves a %s workflow to failed", async (temporalStatus, message) => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: temporalStatus });
    getWorkflowResult.mockResolvedValue({ workflowId: "wf-1", status: "FAILED" });

    const result = await reconcileWorkflowExecution(execution);

    expect(result.status).toBe("failed");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorMessage: message })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ event: "workflow.failed" }));
  });

  it("leaves a running workflow running", async () => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: "RUNNING" });

    const result = await reconcileWorkflowExecution(execution);

    expect(result.status).toBe("running");
    expect(getWorkflowResult).not.toHaveBeenCalled();
  });
});
