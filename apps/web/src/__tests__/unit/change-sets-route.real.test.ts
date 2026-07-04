/**
 * Real route-handler tests for change-set review actions.
 *
 * The handlers should not mutate tasks directly. They authorize the reviewer
 * against the owning workspace, then signal the durable Temporal workflow so
 * the workflow can apply or reject the reviewed plan change.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const findChangeSet = vi.fn();
const selectPendingProposals = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      changeSets: {
        findFirst: (...a: unknown[]) => findChangeSet(...a),
      },
    },
    select: () => ({
      from: () => ({
        where: (...a: unknown[]) => selectPendingProposals(...a),
      }),
    }),
  },
}));

const requireWorkspaceAccess = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));

const signalWorkflow = vi.fn();
const startWorkflow = vi.fn();
vi.mock("@nexus/workflows/client", () => ({
  signalWorkflow: (...a: unknown[]) => signalWorkflow(...a),
  startWorkflow: (...a: unknown[]) => startWorkflow(...a),
}));

import { POST as applyChangeSet } from "@/app/api/change-sets/[id]/apply/route";
import { POST as rejectChangeSet } from "@/app/api/change-sets/[id]/reject/route";

const authed = {
  user: { id: "user-1", email: "user@example.com" },
  session: { id: "s1", expiresAt: new Date(Date.now() + 1e6) },
};

const pendingChangeSet = {
  id: "cs-1",
  workspaceId: "ws-1",
  status: "pending",
  temporalWorkflowId: "plan_impact-abc",
};

function req(body?: unknown) {
  return new Request("http://localhost:3000/api/change-sets/cs-1/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = { params: Promise.resolve({ id: "cs-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  verifySession.mockResolvedValue(authed);
  findChangeSet.mockResolvedValue(pendingChangeSet);
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "member" });
  selectPendingProposals.mockResolvedValue([{ id: "cp-1" }, { id: "cp-2" }]);
  writeAuditLog.mockResolvedValue(undefined);
  signalWorkflow.mockResolvedValue(undefined);
  startWorkflow.mockResolvedValue({ workflowId: "recovery-workflow-1" });
});

describe("POST /api/change-sets/:id/apply", () => {
  it("returns 401 without a session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);
    expect(res.status).toBe(401);
  });

  it("denies reviewers without workspace access", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);
    expect(res.status).toBe(403);
    expect(signalWorkflow).not.toHaveBeenCalled();
  });

  it("signals the durable workflow with selected proposals", async () => {
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1", "cp-2"] }), params);
    expect(res.status).toBe(202);
    expect(signalWorkflow).toHaveBeenCalledWith("plan_impact-abc", "resolvePlanChange", [
      {
        decision: "approve",
        selectedProposalIds: ["cp-1", "cp-2"],
        userId: "user-1",
      },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "plan.change_approved", workspaceId: "ws-1" })
    );
  });

  it("rejects an empty proposal selection", async () => {
    const res = await applyChangeSet(req({ selectedProposalIds: [] }), params);
    expect(res.status).toBe(400);
    expect(signalWorkflow).not.toHaveBeenCalled();
  });

  it("rejects proposal ids outside the pending change set", async () => {
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1", "other"] }), params);
    expect(res.status).toBe(400);
    expect(signalWorkflow).not.toHaveBeenCalled();
  });

  it("returns an idempotent response when the change set is already terminal", async () => {
    findChangeSet.mockResolvedValue({ ...pendingChangeSet, status: "applied" });
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      status: "applied",
      alreadyResolved: true,
    });
    expect(signalWorkflow).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it("returns 409 for non-terminal non-pending change sets", async () => {
    findChangeSet.mockResolvedValue({ ...pendingChangeSet, status: "applying" });
    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);
    expect(res.status).toBe(409);
    expect(signalWorkflow).not.toHaveBeenCalled();
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it("starts a recovery workflow when the original Temporal workflow is closed", async () => {
    signalWorkflow.mockRejectedValue(new Error("workflow execution already completed"));

    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);

    expect(res.status).toBe(202);
    expect(startWorkflow).toHaveBeenCalledWith(
      "applyPlanChangeSetWorkflow",
      {
        changeSetId: "cs-1",
        selectedProposalIds: ["cp-1"],
        userId: "user-1",
      },
      expect.objectContaining({
        taskQueue: "nexus-agents",
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "plan.change_apply_recovery_started", workspaceId: "ws-1" })
    );
  });

  it("starts an external write recovery workflow for external_pending change sets", async () => {
    findChangeSet.mockResolvedValue({ ...pendingChangeSet, status: "external_pending" });

    const res = await applyChangeSet(req({ selectedProposalIds: ["cp-1"] }), params);

    expect(res.status).toBe(202);
    expect(startWorkflow).toHaveBeenCalledWith(
      "runExternalWriteOperationsWorkflow",
      {
        changeSetId: "cs-1",
        userId: "user-1",
      },
      expect.objectContaining({
        taskQueue: "nexus-agents",
      })
    );
    expect(signalWorkflow).not.toHaveBeenCalled();
  });
});

describe("POST /api/change-sets/:id/reject", () => {
  it("signals the durable workflow with a reject decision", async () => {
    const res = await rejectChangeSet(req(), params);
    expect(res.status).toBe(202);
    expect(signalWorkflow).toHaveBeenCalledWith("plan_impact-abc", "resolvePlanChange", [
      {
        decision: "reject",
        userId: "user-1",
      },
    ]);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "plan.change_rejected_by_user", workspaceId: "ws-1" })
    );
  });
});
