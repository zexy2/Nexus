/**
 * POST /api/workflows/:id/cancel against the in-memory fake db: owner and
 * admin may cancel, other members get 403, finished runs get 409, and a
 * double click asks Temporal to cancel exactly once.
 */
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sharedFake as fake } from "../helpers/fake-db";

vi.mock("@/lib/db", async () => ({ db: (await import("../helpers/fake-db")).sharedFake.db }));

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...args: unknown[]) => protectRoute(...args),
  RATE_LIMITS: { workflowStatus: { windowMs: 1000, maxRequests: 100, keyPrefix: "wf" } },
}));

const roles: Record<string, "owner" | "admin" | "member"> = {};
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: vi.fn(async (userId: string) => (roles[userId] ? ["ws-1"] : [])),
  requireWorkspaceAccess: vi.fn(async (userId: string, workspaceId: string) =>
    roles[userId]
      ? { ok: true, workspaceId, role: roles[userId] }
      : { ok: false, status: 403, error: "Workspace access denied" }
  ),
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const reconcileWorkflowExecution = vi.fn();
vi.mock("@/lib/workflow-reconcile", () => ({
  reconcileWorkflowExecution: (...args: unknown[]) => reconcileWorkflowExecution(...args),
}));

const cancelWorkflow = vi.fn();
vi.mock("@nexus/workflows/client", () => ({
  createTemporalClient: vi.fn(async () => ({})),
  cancelWorkflow: (...args: unknown[]) => cancelWorkflow(...args),
}));

import { POST as cancelRoute } from "@/app/api/workflows/[id]/cancel/route";

function asUser(id: string) {
  protectRoute.mockResolvedValue({ success: true, user: { id, email: `${id}@x.com`, name: id } });
}

function cancel(id: string) {
  return cancelRoute(
    new NextRequest(`http://localhost:3000/api/workflows/${id}/cancel`, { method: "POST" }),
    { params: Promise.resolve({ id }) }
  );
}

const execution = () => fake.rows("agent_executions").find((row) => row.id === "exec-1")!;

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
  for (const key of Object.keys(roles)) delete roles[key];
  roles["owner-user"] = "member";
  roles["other-member"] = "member";
  roles["ws-admin"] = "admin";
  asUser("owner-user");
  cancelWorkflow.mockResolvedValue(undefined);
  // Default: reconciliation finds the run still running.
  reconcileWorkflowExecution.mockImplementation(async (row: unknown) => row);
  fake.seed("agent_executions", {
    id: "exec-1",
    workspaceId: "ws-1",
    agentType: "researcher",
    status: "running",
    input: { workflowType: "research" },
    temporalWorkflowId: "research-wf-1",
    createdBy: "owner-user",
    cancelRequestedAt: null,
  });
});

describe("POST /api/workflows/:id/cancel", () => {
  it("rejects unauthenticated requests", async () => {
    protectRoute.mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await cancel("research-wf-1")).status).toBe(401);
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it("lets the user who started the run cancel it (202) and requests Temporal cancellation", async () => {
    const response = await cancel("research-wf-1");

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      workflowId: "research-wf-1",
      executionId: "exec-1",
      status: "cancelling",
    });
    expect(cancelWorkflow).toHaveBeenCalledWith("research-wf-1");
    expect(execution().cancelRequestedAt).toBeInstanceOf(Date);
    // Stays running until reconciliation sees CANCELLED (after cleanup).
    expect(execution().status).toBe("running");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "workflow.cancel_requested", userId: "owner-user" })
    );
  });

  it("is idempotent: a second click answers 202 without a second Temporal call", async () => {
    expect((await cancel("research-wf-1")).status).toBe(202);
    const again = await cancel("research-wf-1");

    expect(again.status).toBe(202);
    expect(await again.json()).toMatchObject({ status: "cancelling", alreadyRequested: true });
    expect(cancelWorkflow).toHaveBeenCalledTimes(1);
  });

  it("asks Temporal once for concurrent double clicks", async () => {
    const [a, b] = await Promise.all([cancel("research-wf-1"), cancel("research-wf-1")]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(cancelWorkflow).toHaveBeenCalledTimes(1);
  });

  it("forbids another workspace member from cancelling someone else's run (403)", async () => {
    asUser("other-member");
    const response = await cancel("research-wf-1");

    expect(response.status).toBe(403);
    expect(cancelWorkflow).not.toHaveBeenCalled();
    expect(execution().cancelRequestedAt).toBeNull();
  });

  it("lets a workspace admin cancel a member's run", async () => {
    asUser("ws-admin");
    expect((await cancel("research-wf-1")).status).toBe(202);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ onBehalfOf: "owner-user" }) })
    );
  });

  it("hides runs of workspaces the caller cannot access (404)", async () => {
    asUser("stranger");
    expect((await cancel("research-wf-1")).status).toBe(404);
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it("answers 409 for a run that already finished", async () => {
    execution().status = "completed";
    reconcileWorkflowExecution.mockImplementation(async (row: unknown) => row);

    const response = await cancel("research-wf-1");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "WORKFLOW_ALREADY_FINISHED", status: "completed" });
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it("answers 409 when reconciliation shows the run finished since the last poll", async () => {
    reconcileWorkflowExecution.mockImplementation(async (row: Record<string, unknown>) => ({
      ...row,
      status: "completed",
    }));

    expect((await cancel("research-wf-1")).status).toBe(409);
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it("answers 409 for a plan-impact run whose review was already resolved", async () => {
    Object.assign(execution(), { input: { workflowType: "plan_impact", docId: "doc-1" }, temporalWorkflowId: "plan_impact-wf" });
    fake.seed("change_sets", { id: "cs-1", temporalWorkflowId: "plan_impact-wf", status: "applied" });

    const response = await cancel("plan_impact-wf");

    expect(response.status).toBe(409);
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });

  it("cancels a plan-impact run while its review is pending", async () => {
    Object.assign(execution(), { input: { workflowType: "plan_impact", docId: "doc-1" }, temporalWorkflowId: "plan_impact-wf" });
    fake.seed("change_sets", { id: "cs-1", temporalWorkflowId: "plan_impact-wf", status: "pending" });

    expect((await cancel("plan_impact-wf")).status).toBe(202);
    expect(cancelWorkflow).toHaveBeenCalledWith("plan_impact-wf");
  });

  it("answers 409 and releases the claim when Temporal says the run is already closed", async () => {
    cancelWorkflow.mockRejectedValue(Object.assign(new Error("workflow not found"), { name: "WorkflowNotFoundError" }));
    reconcileWorkflowExecution
      .mockImplementationOnce(async (row: unknown) => row)
      .mockImplementationOnce(async (row: Record<string, unknown>) => ({ ...row, status: "completed" }));

    const response = await cancel("research-wf-1");

    expect(response.status).toBe(409);
    expect(execution().cancelRequestedAt).toBeNull();
  });

  it("answers 503 and releases the claim when Temporal is unavailable, so a retry works", async () => {
    cancelWorkflow.mockRejectedValueOnce(new Error("14 UNAVAILABLE: connection refused"));

    expect((await cancel("research-wf-1")).status).toBe(503);
    expect(execution().cancelRequestedAt).toBeNull();

    expect((await cancel("research-wf-1")).status).toBe(202);
    expect(cancelWorkflow).toHaveBeenCalledTimes(2);
  });

  it("refuses in-process command runs, which have no Temporal workflow", async () => {
    execution().temporalWorkflowId = "cmd-123";
    expect((await cancel("cmd-123")).status).toBe(409);
    expect(cancelWorkflow).not.toHaveBeenCalled();
  });
});
