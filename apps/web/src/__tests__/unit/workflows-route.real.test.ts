/**
 * Real route-handler tests for /api/workflows (durable Temporal workflows).
 *
 * Drives the actual POST handler: auth, type/input validation, membership-aware
 * workspace access, AI budget, the durable-execution record (persisted as
 * running, marked failed on a start error), and the 202 success shape. The
 * Temporal client is mocked (dynamic import), so these run without a worker.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { research: { windowMs: 1000, maxRequests: 10, keyPrefix: "research" } },
}));

const requireWorkspaceAccess = vi.fn();
const getAccessibleWorkspaceIds = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const enforceAiBudget = vi.fn();
const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));

vi.mock("@/lib/workflow-reconcile", () => ({
  reconcileRunningWorkflowExecutions: vi.fn(async (rows: unknown) => rows),
  reconcileWorkflowExecution: vi.fn(),
  extractWorkflowSteps: vi.fn(() => []),
}));

const insertReturning = vi.fn();
const updateWhere = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({ values: () => ({ returning: (...a: unknown[]) => insertReturning(...a) }) }),
    update: () => ({ set: () => ({ where: (...a: unknown[]) => updateWhere(...a) }) }),
  },
}));

// Temporal client (dynamically imported by the route). startWorkflow is a
// controllable spy; createTemporalClient resolves so initTemporal succeeds.
const startWorkflow = vi.fn();
vi.mock("@nexus/workflows/client", () => ({
  createTemporalClient: vi.fn(async () => ({})),
  startWorkflow: (...a: unknown[]) => startWorkflow(...a),
}));

import { POST } from "@/app/api/workflows/route";

const authedUser = { id: "user-1", email: "u@x.com" };

function wfReq(body: unknown) {
  return new NextRequest("http://localhost:3000/api/workflows", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  protectRoute.mockResolvedValue({ success: true, user: authedUser });
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "owner" });
  enforceAiBudget.mockResolvedValue({ ok: true });
  writeAuditLog.mockResolvedValue(undefined);
  insertReturning.mockResolvedValue([{ id: "exec-1" }]);
  updateWhere.mockResolvedValue(undefined);
  startWorkflow.mockResolvedValue({ workflowId: "document-abc", runId: "run-1", status: "RUNNING" });
});

describe("POST /api/workflows (real handler)", () => {
  it("rejects unauthenticated requests", async () => {
    protectRoute.mockResolvedValue({ success: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) });
    const res = await POST(wfReq({ workflowType: "document", input: { prompt: "x" } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid workflow type", async () => {
    const res = await POST(wfReq({ workflowType: "nonsense", input: { prompt: "x" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when input is missing", async () => {
    const res = await POST(wfReq({ workflowType: "document", input: {} }));
    expect(res.status).toBe(400);
  });

  it("denies access to a workspace the caller cannot use", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });
    const res = await POST(wfReq({ workflowType: "document", input: { prompt: "x" }, workspaceId: "other" }));
    expect(res.status).toBe(403);
  });

  it("rejects when the AI budget is exhausted", async () => {
    enforceAiBudget.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 }) });
    const res = await POST(wfReq({ workflowType: "document", input: { prompt: "x" } }));
    expect(res.status).toBe(429);
  });

  it("starts the workflow, persists a running execution, and returns 202", async () => {
    const res = await POST(wfReq({ workflowType: "document", input: { prompt: "Write about pgvector", title: "pgvector" } }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ executionId: "exec-1", status: "running" });
    expect(body.workflowId).toContain("document");
    // started the right Temporal workflow with a durable id
    expect(startWorkflow).toHaveBeenCalledWith(
      "documentGenerationWorkflow",
      expect.objectContaining({ workspaceId: "ws-1", userId: "user-1", prompt: "Write about pgvector" }),
      expect.objectContaining({ taskQueue: "nexus-agents" })
    );
    expect(insertReturning).toHaveBeenCalled();
  });

  it("marks the execution failed and returns 503 when the workflow fails to start", async () => {
    startWorkflow.mockRejectedValue(new Error("temporal down"));
    const res = await POST(wfReq({ workflowType: "document", input: { prompt: "x" } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("WORKFLOW_START_FAILED");
    expect(body.executionId).toBe("exec-1");
    // the running execution was reconciled to failed
    expect(updateWhere).toHaveBeenCalled();
  });
});
