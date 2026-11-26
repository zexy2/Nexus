/**
 * Temporal execution status -> agent_executions.status mapping.
 *
 * Temporal reports CANCELLED (double L) and TIMED_OUT; neither may be left
 * as "running", or the execution never reaches a terminal state. A user
 * cancel is shown as "cancelled", never as "failed".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSet = vi.fn();
const changeSetFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => {
        updateSet(values);
        return {
          where: () => ({
            returning: async () => [{ ...currentExecution, ...(values as object) }],
          }),
        };
      },
    }),
    query: {
      agentExecutions: { findFirst: vi.fn() },
      changeSets: { findFirst: (...args: unknown[]) => changeSetFindFirst(...args) },
    },
  },
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const createNotification = vi.fn();
const resolveExecutionOwner = vi.fn();
vi.mock("@/lib/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications")>()),
  createNotification: (...args: unknown[]) => createNotification(...args),
  resolveExecutionOwner: (...args: unknown[]) => resolveExecutionOwner(...args),
}));

const resolveOrphanedChangeSet = vi.fn();
vi.mock("@/lib/change-set-recovery", () => ({
  resolveOrphanedChangeSet: (...args: unknown[]) => resolveOrphanedChangeSet(...args),
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
  phaseFromPendingActivities,
  reconcileWorkflowExecution,
} from "@/lib/workflow-reconcile";

type Execution = Parameters<typeof reconcileWorkflowExecution>[0];

let currentExecution: Record<string, unknown> = {};

function makeExecution(overrides: Record<string, unknown> = {}): Execution {
  currentExecution = {
    id: "exec-1",
    workspaceId: "ws-1",
    temporalWorkflowId: "wf-1",
    status: "running",
    input: { workflowType: "research" },
    output: null,
    errorMessage: null,
    createdBy: "user-1",
    cancelRequestedAt: null,
    ...overrides,
  };
  return currentExecution as unknown as Execution;
}

describe("status mapping table", () => {
  it.each([
    ["RUNNING", "running"],
    ["CONTINUED_AS_NEW", "running"],
    ["UNSPECIFIED", "running"],
    ["COMPLETED", "completed"],
    ["FAILED", "failed"],
    ["CANCELLED", "cancelled"],
    ["TERMINATED", "failed"],
    ["TIMED_OUT", "failed"],
    ["WORKFLOW_EXECUTION_STATUS_TIMED_OUT", "failed"],
    ["cancelled", "cancelled"],
    ["something-new", "running"],
  ])("%s -> %s", (temporal, expected) => {
    expect(normalizeTemporalStatus(temporal)).toBe(expected);
  });
});

describe("phaseFromPendingActivities", () => {
  it("maps the in-flight activity to a phase and keeps its retry attempt", () => {
    expect(phaseFromPendingActivities([{ activityType: "callWriterAgent", attempt: 3 }])).toEqual({
      phase: "writing",
      attempt: 3,
    });
  });

  it("ignores bookkeeping activities and reports no phase without a signal", () => {
    expect(phaseFromPendingActivities([{ activityType: "sendNotification", attempt: 1 }])).toEqual({
      phase: null,
      attempt: 1,
    });
    expect(phaseFromPendingActivities([])).toEqual({ phase: null, attempt: 1 });
  });
});

describe("reconcileWorkflowExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveExecutionOwner.mockResolvedValue("user-1");
    createNotification.mockResolvedValue(true);
    changeSetFindFirst.mockResolvedValue(undefined);
  });

  it.each([
    ["TIMED_OUT", "Workflow timed out"],
    ["TERMINATED", "Workflow was terminated"],
  ])("moves a %s workflow to failed and notifies the owner", async (temporalStatus, message) => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: temporalStatus });
    getWorkflowResult.mockResolvedValue({ workflowId: "wf-1", status: "FAILED" });

    const result = await reconcileWorkflowExecution(makeExecution());

    expect(result.status).toBe("failed");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorMessage: message })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ event: "workflow.failed" }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", type: "workflow_failed", dedupeKey: "workflow:exec-1:failed" })
    );
  });

  it("shows a cancelled workflow as cancelled even though its result rejects", async () => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: "CANCELLED" });
    // handle.result() of a cancelled run rejects -> reported as FAILED.
    getWorkflowResult.mockResolvedValue({ workflowId: "wf-1", status: "FAILED", error: "Workflow execution cancelled" });

    const result = await reconcileWorkflowExecution(makeExecution());

    expect(result.status).toBe("cancelled");
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", errorMessage: "Workflow was cancelled" })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ event: "workflow.cancelled" }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "workflow_cancelled", dedupeKey: "workflow:exec-1:cancelled" })
    );
  });

  it("releases a review left pending by a cancelled plan-impact run", async () => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: "CANCELLED" });
    getWorkflowResult.mockResolvedValue({ workflowId: "wf-1", status: "FAILED" });
    changeSetFindFirst.mockResolvedValue({ id: "cs-9", status: "pending" });

    await reconcileWorkflowExecution(makeExecution({ input: { workflowType: "plan_impact", docId: "doc-1" } }), {
      userId: "user-1",
    });

    expect(resolveOrphanedChangeSet).toHaveBeenCalledWith("cs-9", "cancelled", "user-1", "workflow_cancelled");
  });

  it("notifies completion to the run's owner, not the polling user", async () => {
    resolveExecutionOwner.mockResolvedValue("owner-7");
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: "COMPLETED" });
    getWorkflowResult.mockResolvedValue({ workflowId: "wf-1", status: "COMPLETED", result: { steps: [] } });

    await reconcileWorkflowExecution(makeExecution(), { userId: "someone-else" });

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-7", type: "workflow_completed" })
    );
  });

  it("leaves a running workflow running and reports its live phase", async () => {
    getWorkflowStatus.mockResolvedValue({
      workflowId: "wf-1",
      status: "RUNNING",
      pendingActivities: [{ activityType: "callResearchAgent", attempt: 1 }],
    });

    const result = await reconcileWorkflowExecution(makeExecution());

    expect(result.status).toBe("running");
    expect(result.progress).toEqual({ phase: "researching", attempt: 1 });
    expect(getWorkflowResult).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("reports a parked plan-impact run as awaiting review and notifies once per change set", async () => {
    getWorkflowStatus.mockResolvedValue({ workflowId: "wf-1", status: "RUNNING", pendingActivities: [] });
    changeSetFindFirst.mockResolvedValue({ id: "cs-1", status: "pending" });

    const result = await reconcileWorkflowExecution(
      makeExecution({ input: { workflowType: "plan_impact", docId: "doc-1" } })
    );

    expect(result.progress).toEqual({ phase: "awaitingReview", attempt: 1, changeSetId: "cs-1" });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "plan_review_pending",
        dedupeKey: "plan_review:cs-1",
        data: expect.objectContaining({ changeSetId: "cs-1" }),
      })
    );
  });
});
