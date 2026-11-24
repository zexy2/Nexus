/**
 * A pending change set whose planImpactWorkflow died must still reach a
 * terminal state: reject works without the workflow, and a dead or overdue
 * review is expired so analyze-change unlocks the doc.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeSets, planVersions } from "@nexus/database/schema";

const db = vi.hoisted(() => ({
  lockedRow: null as null | { id: string; workspaceId: string; proposedVersionId: string; status: string },
  updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  inserts: [] as Array<Record<string, unknown>>,
  executes: 0,
  findDoc: vi.fn(),
  findChangeSet: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: async () => (db.lockedRow ? [db.lockedRow] : []),
        }),
      }),
    }),
    execute: async () => {
      db.executes += 1;
      return [];
    },
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          db.updates.push({ table, values });
          if (table === changeSets && db.lockedRow) db.lockedRow.status = String(values.status);
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        db.inserts.push(values);
      },
    }),
  };
  return {
    db: {
      transaction: async <T,>(callback: (t: typeof tx) => Promise<T>) => callback(tx),
      query: {
        docs: { findFirst: (...args: unknown[]) => db.findDoc(...args) },
        changeSets: { findFirst: (...args: unknown[]) => db.findChangeSet(...args) },
      },
    },
  };
});

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...args: unknown[]) => verifySession(...args),
}));

vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: async () => ({ ok: true, workspaceId: "ws-1", role: "member" }),
}));

vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: vi.fn(async () => undefined),
  getAiProviderStatus: () => ({ aiEnabled: true, geminiAvailable: true }),
  aiUnavailableResponse: () => new Response(null, { status: 503 }),
}));

const startPlanWorkflow = vi.fn();
vi.mock("@/app/api/workflows/route", () => ({
  POST: (...args: unknown[]) => startPlanWorkflow(...args),
}));

const signalWorkflow = vi.fn();
const getWorkflowStatus = vi.fn();
vi.mock("@nexus/workflows/client", () => ({
  signalWorkflow: (...args: unknown[]) => signalWorkflow(...args),
  getWorkflowStatus: (...args: unknown[]) => getWorkflowStatus(...args),
}));

import {
  PLAN_CHANGE_EXPIRY_GRACE_MS,
  PLAN_CHANGE_REVIEW_WINDOW_MS,
  decidePendingChangeSetRecovery,
  expirePendingChangeSetIfOrphaned,
} from "@/lib/change-set-recovery";
import { POST as rejectChangeSet } from "@/app/api/change-sets/[id]/reject/route";
import { POST as analyzeChange } from "@/app/api/plans/[docId]/analyze-change/route";

// Relative to the real clock: the route handlers read Date.now(), so a fixed
// date here turns "recent" into "overdue" once the 72 h window has passed.
const now = new Date();
const recent = new Date(now.getTime() - 60 * 60 * 1000);
const overdue = new Date(now.getTime() - PLAN_CHANGE_REVIEW_WINDOW_MS - PLAN_CHANGE_EXPIRY_GRACE_MS - 1000);

function pendingChangeSet(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs-1",
    workspaceId: "ws-1",
    docId: "doc-1",
    proposedVersionId: "pv-2",
    status: "pending",
    temporalWorkflowId: "plan_impact-dead",
    createdAt: recent,
    ...overrides,
  };
}

function changeSetUpdate() {
  return db.updates.find((update) => update.table === changeSets)?.values;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.lockedRow = { id: "cs-1", workspaceId: "ws-1", proposedVersionId: "pv-2", status: "pending" };
  db.updates = [];
  db.inserts = [];
  db.executes = 0;
  verifySession.mockResolvedValue({ user: { id: "user-1" } });
  db.findDoc.mockResolvedValue({ id: "doc-1", workspaceId: "ws-1", isArchived: 0 });
  startPlanWorkflow.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
});

describe("decidePendingChangeSetRecovery", () => {
  it.each([
    ["running workflow inside the window", { createdAt: recent }, "running", "keep"],
    ["Temporal unreachable inside the window", { createdAt: recent }, "unknown", "keep"],
    ["closed workflow", { createdAt: recent }, "closed", "expire"],
    ["workflow not found", { createdAt: recent }, "not_found", "expire"],
    ["no workflow id", { createdAt: recent, temporalWorkflowId: null }, "unknown", "expire"],
    ["past the 72 h window even if running", { createdAt: overdue }, "running", "expire"],
    ["already resolved", { createdAt: overdue, status: "applied" }, "closed", "keep"],
  ] as const)("%s -> %s", (_label, overrides, liveness, expected) => {
    expect(
      decidePendingChangeSetRecovery(pendingChangeSet(overrides) as never, liveness, now)
    ).toBe(expected);
  });
});

describe("dead plan-impact -> doc unlocks", () => {
  it("reject on a closed workflow rejects the change set directly instead of returning 409", async () => {
    db.findChangeSet.mockResolvedValue(pendingChangeSet());
    signalWorkflow.mockRejectedValue(new Error("workflow execution already completed"));

    const res = await rejectChangeSet(
      new Request("http://localhost/api/change-sets/cs-1/reject", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "cs-1" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "rejected", recovered: true });
    expect(changeSetUpdate()).toMatchObject({ status: "rejected", resolvedBy: "user-1" });
    expect(db.updates.find((update) => update.table === planVersions)?.values).toEqual({ status: "rejected" });
    expect(db.executes).toBe(1); // task realignment
    expect(db.inserts).toContainEqual(expect.objectContaining({ event: "plan.change_rejected" }));
  });

  it("reject still returns 409 when the change set was resolved concurrently", async () => {
    db.findChangeSet.mockResolvedValue(pendingChangeSet());
    db.lockedRow = { id: "cs-1", workspaceId: "ws-1", proposedVersionId: "pv-2", status: "applied" };
    signalWorkflow.mockRejectedValue(new Error("workflow execution already completed"));

    const res = await rejectChangeSet(
      new Request("http://localhost/api/change-sets/cs-1/reject", { method: "POST" }) as never,
      { params: Promise.resolve({ id: "cs-1" }) }
    );

    expect(res.status).toBe(409);
    expect(changeSetUpdate()).toBeUndefined();
  });

  it("analyze-change expires a pending review whose workflow is gone and starts a new analysis", async () => {
    db.findChangeSet.mockResolvedValue(pendingChangeSet());
    getWorkflowStatus.mockResolvedValue({ workflowId: "plan_impact-dead", status: "FAILED" });

    const res = await analyzeChange(
      new Request("http://localhost/api/plans/doc-1/analyze-change", { method: "POST" }) as never,
      { params: Promise.resolve({ docId: "doc-1" }) }
    );

    expect(res.status).toBe(202);
    expect(changeSetUpdate()).toMatchObject({ status: "expired" });
    expect(startPlanWorkflow).toHaveBeenCalledTimes(1);
  });

  it("analyze-change keeps the doc locked while the review workflow is alive", async () => {
    db.findChangeSet.mockResolvedValue(pendingChangeSet());
    getWorkflowStatus.mockResolvedValue({ workflowId: "plan_impact-dead", status: "RUNNING" });

    const res = await analyzeChange(
      new Request("http://localhost/api/plans/doc-1/analyze-change", { method: "POST" }) as never,
      { params: Promise.resolve({ docId: "doc-1" }) }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "CHANGE_REVIEW_PENDING" });
    expect(changeSetUpdate()).toBeUndefined();
    expect(startPlanWorkflow).not.toHaveBeenCalled();
  });

  it("analyze-change keeps the doc locked when Temporal is unreachable inside the window", async () => {
    db.findChangeSet.mockResolvedValue(pendingChangeSet());
    getWorkflowStatus.mockRejectedValue(new Error("14 UNAVAILABLE: connection refused"));

    const res = await analyzeChange(
      new Request("http://localhost/api/plans/doc-1/analyze-change", { method: "POST" }) as never,
      { params: Promise.resolve({ docId: "doc-1" }) }
    );

    expect(res.status).toBe(409);
    expect(changeSetUpdate()).toBeUndefined();
  });

  it("expires an overdue review without asking Temporal (lost 72 h timer)", async () => {
    const expired = await expirePendingChangeSetIfOrphaned(
      pendingChangeSet({ createdAt: overdue }) as never,
      { checkWorkflow: false, now }
    );

    expect(expired).toBe(true);
    expect(getWorkflowStatus).not.toHaveBeenCalled();
    expect(changeSetUpdate()).toMatchObject({ status: "expired" });
    expect(db.inserts).toContainEqual(
      expect.objectContaining({ event: "plan.change_expired", metadata: expect.objectContaining({ reason: "review_window_elapsed" }) })
    );
  });
});
