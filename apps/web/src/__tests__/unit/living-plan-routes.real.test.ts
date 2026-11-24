/**
 * Living Plan routes: GET /api/plans/[docId]/living-plan and
 * POST /api/plans/[docId]/analyze-change (pending-review lock, expiry, start).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  doc: undefined as unknown,
  pendingCs: undefined as unknown,
  acceptedVersion: undefined as unknown,
  selectQueue: [] as unknown[][],
  expire: vi.fn(),
  access: vi.fn(),
  verifySession: vi.fn(),
  startWorkflow: vi.fn(),
  providerStatus: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const chain = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(h.selectQueue.shift() ?? []).then(res, rej);
    return b;
  };
  return {
    db: {
      select: () => chain(),
      query: {
        docs: { findFirst: async () => h.doc },
        changeSets: { findFirst: async () => h.pendingCs },
        planVersions: { findFirst: async () => h.acceptedVersion },
      },
    },
  };
});

vi.mock("@/lib/api-middleware", () => ({ verifySession: () => h.verifySession() }));
vi.mock("@/lib/workspace-auth", () => ({ requireWorkspaceAccess: (...a: unknown[]) => h.access(...a) }));
vi.mock("@/lib/change-set-recovery", () => ({
  expirePendingChangeSetIfOrphaned: (...a: unknown[]) => h.expire(...a),
}));
vi.mock("@/lib/production-guardrails", () => ({
  getAiProviderStatus: () => h.providerStatus(),
  aiUnavailableResponse: () => new Response(JSON.stringify({ error: "AI_UNAVAILABLE" }), { status: 503 }),
}));
vi.mock("@/app/api/workflows/route", () => ({ POST: (...a: unknown[]) => h.startWorkflow(...a) }));

import { GET as getLivingPlan } from "@/app/api/plans/[docId]/living-plan/route";
import { POST as analyzeChange } from "@/app/api/plans/[docId]/analyze-change/route";

const params = { params: Promise.resolve({ docId: "doc-1" }) };
const created = new Date("2026-11-20T10:00:00Z");
const doc = { id: "doc-1", title: "Plan", workspaceId: "ws-1", isArchived: 0, updatedAt: created };

function get() {
  return getLivingPlan(new Request("http://localhost/api/plans/doc-1/living-plan") as never, params);
}
function post() {
  return analyzeChange(
    new Request("http://localhost/api/plans/doc-1/analyze-change", {
      method: "POST",
      headers: { cookie: "s=1" },
    }) as never,
    params
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.doc = doc;
  h.pendingCs = undefined;
  h.acceptedVersion = undefined;
  h.selectQueue = [];
  h.verifySession.mockResolvedValue({ user: { id: "user-1" } });
  h.access.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "member" });
  h.expire.mockResolvedValue(false);
  h.providerStatus.mockReturnValue({ aiEnabled: true, geminiAvailable: true });
  h.startWorkflow.mockResolvedValue(new Response(JSON.stringify({ workflowId: "wf-1" }), { status: 202 }));
});

describe("GET /api/plans/[docId]/living-plan", () => {
  it("returns 401 without a session", async () => {
    h.verifySession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("returns 404 for a missing or archived plan", async () => {
    h.doc = undefined;
    expect((await get()).status).toBe(404);
    h.doc = { ...doc, isArchived: 1 };
    expect((await get()).status).toBe(404);
  });

  it("propagates workspace access denial", async () => {
    h.access.mockResolvedValue({ ok: false, error: "Forbidden", status: 403 });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns an empty plan when there is no accepted version", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      doc: { id: "doc-1", workspaceId: "ws-1" },
      currentVersion: null,
      requirements: [],
      coverage: { covered: 0, total: 0, percentage: 0 },
      pendingChangeSet: null,
    });
  });

  it("computes coverage from active requirements with non-archived task links", async () => {
    h.acceptedVersion = { id: "pv-1", versionNumber: 3, status: "accepted", createdAt: created };
    const req = (id: string, status = "active") => ({
      id,
      stableKey: `K-${id}`,
      title: id,
      description: "d",
      acceptanceCriteria: [],
      status,
      changeType: "unchanged",
      confidence: 90,
    });
    h.selectQueue = [
      [req("r1"), req("r2"), req("r3", "removed")],
      [
        { id: "l1", requirementId: "r1", taskId: "t1", taskTitle: "T", taskStatus: "todo", alignmentStatus: "aligned", isArchived: 0 },
        { id: "l2", requirementId: "r2", taskId: "t2", taskTitle: "T2", taskStatus: "todo", alignmentStatus: "aligned", isArchived: 1 },
      ],
    ];
    const body = await (await get()).json();
    expect(body.currentVersion).toMatchObject({ id: "pv-1", versionNumber: 3 });
    expect(body.requirements).toHaveLength(3);
    expect(body.requirements[0].tasks).toHaveLength(1);
    expect(body.coverage).toEqual({ covered: 1, total: 2, percentage: 50 });
  });

  it("reports a live pending change set with its proposal count", async () => {
    h.pendingCs = {
      id: "cs-1",
      status: "pending",
      summary: "s",
      stats: { added: 1 },
      proposedVersionId: "pv-2",
      temporalWorkflowId: "wf-9",
      createdAt: created,
    };
    h.selectQueue = [[], [{ id: "p1" }, { id: "p2" }]]; // requirements of pv-2, proposals
    const body = await (await get()).json();
    expect(body.pendingChangeSet).toMatchObject({ id: "cs-1", proposalCount: 2, workflowId: "wf-9" });
    expect(h.expire).toHaveBeenCalledWith(h.pendingCs, { checkWorkflow: false });
  });

  it("hides a pending change set that has expired", async () => {
    h.pendingCs = { id: "cs-1", status: "pending", proposedVersionId: "pv-2", createdAt: created };
    h.expire.mockResolvedValue(true);
    const body = await (await get()).json();
    expect(body.pendingChangeSet).toBeNull();
  });
});

describe("POST /api/plans/[docId]/analyze-change", () => {
  it("returns 401 without a session", async () => {
    h.verifySession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(h.startWorkflow).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or archived plan", async () => {
    h.doc = undefined;
    expect((await post()).status).toBe(404);
    h.doc = { ...doc, isArchived: 1 };
    expect((await post()).status).toBe(404);
  });

  it("propagates workspace access denial", async () => {
    h.access.mockResolvedValue({ ok: false, error: "Forbidden", status: 403 });
    expect((await post()).status).toBe(403);
    expect(h.startWorkflow).not.toHaveBeenCalled();
  });

  it("returns 503 when the AI provider is unavailable", async () => {
    h.providerStatus.mockReturnValue({ aiEnabled: true, geminiAvailable: false });
    expect((await post()).status).toBe(503);
    expect(h.startWorkflow).not.toHaveBeenCalled();
  });

  it("returns 409 CHANGE_REVIEW_PENDING while a live review exists", async () => {
    h.pendingCs = { id: "cs-1", status: "pending", createdAt: created };
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "CHANGE_REVIEW_PENDING", changeSetId: "cs-1" });
    expect(h.startWorkflow).not.toHaveBeenCalled();
  });

  it("starts a new analysis when the pending review has expired", async () => {
    h.pendingCs = { id: "cs-1", status: "pending", createdAt: created };
    h.expire.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(202);
    expect(h.expire).toHaveBeenCalledWith(h.pendingCs, { userId: "user-1" });
    expect(h.startWorkflow).toHaveBeenCalledTimes(1);
  });

  it("starts a plan_impact workflow on the happy path", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ workflowId: "wf-1" });
    const forwarded = h.startWorkflow.mock.calls[0]![0] as Request;
    expect(new URL(forwarded.url).pathname).toBe("/api/workflows");
    expect(forwarded.headers.get("cookie")).toBe("s=1");
    expect(await forwarded.json()).toEqual({
      workflowType: "plan_impact",
      workspaceId: "ws-1",
      input: { workspaceId: "ws-1", docId: "doc-1" },
    });
  });
});
