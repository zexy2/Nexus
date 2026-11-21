/**
 * Recovery and retry workflows use deterministic ids, so concurrent clicks
 * attach to the run already in flight instead of starting duplicates.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...args: unknown[]) => verifySession(...args),
}));

const findChangeSet = vi.fn();
const findOperation = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      changeSets: { findFirst: (...args: unknown[]) => findChangeSet(...args) },
      externalWriteOperations: { findFirst: (...args: unknown[]) => findOperation(...args) },
    },
    select: () => ({ from: () => ({ where: async () => [{ id: "cp-1" }] }) }),
  },
}));

vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ ok: true, workspaceId: "ws-1", role: "owner" })),
  requireWorkspaceOwner: vi.fn(async () => ({ ok: true, workspaceId: "ws-1", role: "owner" })),
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

/** Fake Temporal: a running workflow id cannot be started again. */
const running = new Set<string>();
const startWorkflow = vi.fn(async (_type: string, _input: unknown, options: { workflowId: string }) => {
  await Promise.resolve();
  if (running.has(options.workflowId)) {
    const error = new Error(`Workflow execution already started: ${options.workflowId}`);
    error.name = "WorkflowExecutionAlreadyStartedError";
    throw error;
  }
  running.add(options.workflowId);
  return { workflowId: options.workflowId, runId: `run-${running.size}`, status: "RUNNING" };
});
vi.mock("@nexus/workflows/client", () => ({
  startWorkflow: (...args: Parameters<typeof startWorkflow>) => startWorkflow(...args),
  signalWorkflow: vi.fn(async () => {
    throw new Error("workflow execution already completed");
  }),
}));

import { POST as applyChangeSet } from "@/app/api/change-sets/[id]/apply/route";
import { POST as retryOperation } from "@/app/api/external-write-operations/[id]/retry/route";
import { isWorkflowAlreadyStartedError } from "@/lib/temporal-start";

const params = { params: Promise.resolve({ id: "cs-1" }) };
const click = (body?: unknown) =>
  applyChangeSet(
    new Request("http://localhost:3000/api/change-sets/cs-1/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }) as never,
    params
  );

beforeEach(() => {
  vi.clearAllMocks();
  running.clear();
  verifySession.mockResolvedValue({ user: { id: "user-1" } });
});

describe("deterministic recovery workflow ids", () => {
  it("recovery click twice → one workflow (external writes)", async () => {
    findChangeSet.mockResolvedValue({ id: "cs-1", workspaceId: "ws-1", status: "external_pending", temporalWorkflowId: "plan-1" });

    const [first, second] = await Promise.all([click(), click()]);
    const bodies = await Promise.all([first.json(), second.json()]);

    expect([first.status, second.status]).toEqual([202, 202]);
    expect(bodies.map((body) => body.workflowId)).toEqual(["change-set-external-cs-1", "change-set-external-cs-1"]);
    expect(bodies.map((body) => body.alreadyRunning).sort()).toEqual([false, true]);
    expect([...running]).toEqual(["change-set-external-cs-1"]);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("recovery click twice → one workflow (apply after the plan workflow closed)", async () => {
    findChangeSet.mockResolvedValue({ id: "cs-1", workspaceId: "ws-1", status: "pending", temporalWorkflowId: "plan-1" });

    const [first, second] = await Promise.all([
      click({ selectedProposalIds: ["cp-1"] }),
      click({ selectedProposalIds: ["cp-1"] }),
    ]);

    expect([first.status, second.status]).toEqual([202, 202]);
    expect((await first.json()).workflowId).toBe("change-set-apply-cs-1");
    expect((await second.json()).workflowId).toBe("change-set-apply-cs-1");
    expect([...running]).toEqual(["change-set-apply-cs-1"]);
  });

  it("retry click twice → one retry workflow", async () => {
    findOperation.mockResolvedValue({ id: "op-1", workspaceId: "ws-1", changeSetId: "cs-1", status: "failed_retryable", syncStatus: "not_required" });
    const retry = () => retryOperation(new Request("http://localhost:3000/api/external-write-operations/op-1/retry", { method: "POST" }), { params: Promise.resolve({ id: "op-1" }) });

    const [first, second] = await Promise.all([retry(), retry()]);
    expect([first.status, second.status]).toEqual([202, 202]);
    expect([...running]).toEqual(["external-write-retry-op-1"]);
    expect(startWorkflow).toHaveBeenCalledTimes(2);
  });

  it("still reports real Temporal failures", async () => {
    findChangeSet.mockResolvedValue({ id: "cs-1", workspaceId: "ws-1", status: "external_pending", temporalWorkflowId: "plan-1" });
    startWorkflow.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const response = await click();
    expect(response.status).toBe(503);
  });

  it("recognises the already-started error by name", () => {
    expect(isWorkflowAlreadyStartedError(Object.assign(new Error("x"), { name: "WorkflowExecutionAlreadyStartedError" }))).toBe(true);
    expect(isWorkflowAlreadyStartedError(new Error("workflow not found"))).toBe(false);
  });
});
