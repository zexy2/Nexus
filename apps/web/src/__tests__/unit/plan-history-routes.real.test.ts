/**
 * Plan version history routes:
 *  - GET  /api/plans/[docId]/versions        (history list + undo eligibility)
 *  - GET  /api/plans/[docId]/versions/diff   (visual diff payload)
 *  - POST /api/change-sets/[id]/undo         (reverting change set)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  doc: undefined as unknown,
  changeSet: undefined as unknown,
  pendingCs: undefined as unknown,
  versionById: new Map<string, unknown>(),
  versionQueue: [] as unknown[],
  selectQueue: [] as unknown[][],
  changeSetQueue: [] as unknown[],
  expire: vi.fn(),
  access: vi.fn(),
  verifySession: vi.fn(),
  undo: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const chain = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(h.selectQueue.shift() ?? []).then(res, rej);
    return b;
  };
  return {
    db: {
      select: () => chain(),
      query: {
        docs: { findFirst: async () => h.doc },
        changeSets: {
          findFirst: async () => (h.changeSetQueue.length ? h.changeSetQueue.shift() : undefined),
        },
        planVersions: { findFirst: async () => h.versionQueue.shift() },
      },
    },
  };
});

vi.mock("@/lib/api-middleware", () => ({ verifySession: () => h.verifySession() }));
vi.mock("@/lib/workspace-auth", () => ({ requireWorkspaceAccess: (...a: unknown[]) => h.access(...a) }));
vi.mock("@/lib/change-set-recovery", () => ({
  expirePendingChangeSetIfOrphaned: (...a: unknown[]) => h.expire(...a),
}));
vi.mock("@/lib/production-guardrails", () => ({ writeAuditLog: (...a: unknown[]) => h.audit(...a) }));
vi.mock("@/lib/plan-history/undo", () => ({ undoChangeSet: (...a: unknown[]) => h.undo(...a) }));

import { GET as listVersions } from "@/app/api/plans/[docId]/versions/route";
import { GET as getDiff } from "@/app/api/plans/[docId]/versions/diff/route";
import { POST as undoRoute } from "@/app/api/change-sets/[id]/undo/route";

const created = new Date("2026-11-20T10:00:00Z");
const doc = { id: "doc-1", title: "Plan", workspaceId: "ws-1", isArchived: 0, updatedAt: created };
const V1 = "11111111-1111-4111-8111-111111111111";
const V2 = "22222222-2222-4222-8222-222222222222";

const version = (id: string, n: number, status: string, contentText: string, baseVersionId: string | null = null) => ({
  id,
  docId: "doc-1",
  workspaceId: "ws-1",
  versionNumber: n,
  title: "Plan",
  content: null,
  contentText,
  status,
  baseVersionId,
  createdBy: "user-1",
  createdAt: created,
});

const appliedCs = {
  id: "cs-2",
  workspaceId: "ws-1",
  docId: "doc-1",
  baseVersionId: V1,
  proposedVersionId: V2,
  temporalWorkflowId: "plan_impact-2",
  status: "applied",
  summary: "Added SSO",
  stats: { added: 1 },
  revertsChangeSetId: null,
  createdBy: "user-1",
  resolvedBy: "user-1",
  resolvedAt: created,
  createdAt: created,
  updatedAt: created,
};

function list() {
  return listVersions(new Request("http://localhost/api/plans/doc-1/versions") as never, {
    params: Promise.resolve({ docId: "doc-1" }),
  });
}
function diff(query = "") {
  return getDiff(new Request(`http://localhost/api/plans/doc-1/versions/diff${query}`) as never, {
    params: Promise.resolve({ docId: "doc-1" }),
  });
}
function undo(id = "cs-2") {
  return undoRoute(
    new Request(`http://localhost/api/change-sets/${id}/undo`, { method: "POST" }) as never,
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.doc = doc;
  h.changeSetQueue = [];
  h.versionQueue = [];
  h.selectQueue = [];
  h.verifySession.mockResolvedValue({ user: { id: "user-1" } });
  h.access.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "owner" });
  h.expire.mockResolvedValue(false);
});

describe("GET /api/plans/[docId]/versions", () => {
  it("returns 401 without a session and 404 for a missing plan", async () => {
    h.verifySession.mockResolvedValueOnce(null);
    expect((await list()).status).toBe(401);
    h.doc = undefined;
    expect((await list()).status).toBe(404);
  });

  it("propagates workspace access denial", async () => {
    h.access.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });
    expect((await list()).status).toBe(403);
  });

  it("lists versions newest first with author, change set, workflow and undo eligibility", async () => {
    h.changeSetQueue = [undefined]; // no pending review
    h.selectQueue = [
      [version(V2, 2, "accepted", "a\nb", V1), version(V1, 1, "superseded", "a", null)], // versions
      [appliedCs, { ...appliedCs, id: "cs-1", proposedVersionId: V1, baseVersionId: null }], // change sets
      [], // reverts
      [{ id: "user-1", name: "Ada" }], // users
      [{ planVersionId: V2, count: 3 }], // requirement counts
      [{ changeSetId: "cs-2", provider: "github", status: "succeeded" }], // external writes
    ];
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentVersionId).toBe(V2);
    expect(body.canUndo).toBe(true);
    expect(body.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1]);
    expect(body.versions[0]).toMatchObject({
      createdBy: { id: "user-1", name: "Ada" },
      baseVersionNumber: 1,
      requirementCount: 3,
      changeSet: {
        id: "cs-2",
        workflowId: "plan_impact-2",
        externalWrites: { pushed: 1, providers: ["github"] },
        undo: { allowed: true, reason: null },
      },
    });
    // Older change sets are blocked: undo only the newest one.
    expect(body.versions[1].changeSet.undo).toEqual({ allowed: false, reason: "NOT_LATEST" });
  });

  it("marks undo blocked for members and while a review is pending", async () => {
    h.access.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "member" });
    h.changeSetQueue = [{ id: "cs-pending", status: "pending", createdAt: created }];
    h.selectQueue = [[version(V2, 2, "accepted", "a", V1)], [appliedCs], [], [], [], []];
    const body = await (await list()).json();
    expect(body.canUndo).toBe(false);
    expect(body.pendingChangeSetId).toBe("cs-pending");
    expect(body.versions[0].changeSet.undo).toEqual({ allowed: false, reason: "CHANGE_REVIEW_PENDING" });
  });
});

describe("GET /api/plans/[docId]/versions/diff", () => {
  it("rejects non-uuid ids", async () => {
    expect((await diff("?to=nope")).status).toBe(400);
  });

  it("returns 404 when a version does not belong to the plan", async () => {
    h.versionQueue = [undefined];
    expect((await diff(`?to=${V2}`)).status).toBe(404);
  });

  it("diffs a version against the previous one by default", async () => {
    h.versionQueue = [version(V2, 2, "accepted", "keep\nnew line", V1), version(V1, 1, "superseded", "keep\nold line")];
    h.selectQueue = [
      [{ stableKey: "REQ-001", title: "Old", description: "d", acceptanceCriteria: [], status: "active" }],
      [
        { stableKey: "REQ-001", title: "New", description: "d", acceptanceCriteria: [], status: "active" },
        { stableKey: "REQ-002", title: "SSO", description: "d", acceptanceCriteria: [], status: "active" },
      ],
    ];
    const res = await diff(`?to=${V2}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.from.versionNumber).toBe(1);
    expect(body.to.versionNumber).toBe(2);
    expect(body.stats).toEqual({ added: 1, removed: 1 });
    expect(body.lines).toEqual([
      { type: "equal", text: "keep", oldNumber: 1, newNumber: 1 },
      { type: "removed", text: "old line", oldNumber: 2 },
      { type: "added", text: "new line", newNumber: 2 },
    ]);
    expect(body.requirements.added).toEqual([{ stableKey: "REQ-002", title: "SSO" }]);
    expect(body.requirements.modified[0]).toMatchObject({ stableKey: "REQ-001", fields: ["title"] });
  });

  it("diffs the first version against an empty plan", async () => {
    h.versionQueue = [version(V1, 1, "accepted", "only"), undefined];
    h.selectQueue = [[]];
    const body = await (await diff()).json();
    expect(body.from).toBeNull();
    expect(body.lines).toEqual([{ type: "added", text: "only", newNumber: 1 }]);
  });
});

describe("POST /api/change-sets/[id]/undo", () => {
  it("returns 401 without a session and 404 for an unknown change set", async () => {
    h.verifySession.mockResolvedValueOnce(null);
    expect((await undo()).status).toBe(401);
    expect((await undo()).status).toBe(404);
  });

  it("returns 403 for non-members and for members without owner/admin role", async () => {
    h.changeSetQueue = [appliedCs];
    h.access.mockResolvedValueOnce({ ok: false, status: 403, error: "Workspace access denied" });
    expect((await undo()).status).toBe(403);

    h.changeSetQueue = [appliedCs];
    h.access.mockResolvedValueOnce({ ok: true, workspaceId: "ws-1", role: "member" });
    const res = await undo();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("UNDO_FORBIDDEN");
    expect(h.undo).not.toHaveBeenCalled();
  });

  it("returns 409 while a live plan review is pending (lock)", async () => {
    h.changeSetQueue = [appliedCs, { id: "cs-pending", status: "pending", createdAt: created }];
    const res = await undo();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "CHANGE_REVIEW_PENDING", changeSetId: "cs-pending" });
    expect(h.undo).not.toHaveBeenCalled();
  });

  it("expires an orphaned pending review instead of staying locked", async () => {
    h.changeSetQueue = [appliedCs, { id: "cs-orphan", status: "pending", createdAt: created }];
    h.expire.mockResolvedValue(true);
    h.undo.mockResolvedValue({
      ok: true,
      changeSetId: "cs-3",
      versionId: "v3",
      versionNumber: 3,
      restoredVersionNumber: 1,
      revertedTasks: 0,
      externalNotReverted: 0,
    });
    expect((await undo()).status).toBe(201);
  });

  it("returns 409 when the lock is taken inside the transaction (race)", async () => {
    h.changeSetQueue = [appliedCs];
    h.undo.mockResolvedValue({ ok: false, code: "CHANGE_REVIEW_PENDING", changeSetId: "cs-new" });
    const res = await undo();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("CHANGE_REVIEW_PENDING");
  });

  it("refuses with 409 UNDO_CONFLICT when tasks were edited afterwards", async () => {
    h.changeSetQueue = [appliedCs];
    const conflicts = [{ taskId: "t-1", title: "Build SSO", reason: "task_edited" }];
    h.undo.mockResolvedValue({ ok: false, code: "UNDO_CONFLICT", conflicts });
    const res = await undo();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "UNDO_CONFLICT", conflicts });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("maps NOT_LATEST, ALREADY_REVERTED, external_pending and unsupported to 409", async () => {
    const cases: Array<[unknown, string]> = [
      [{ ok: false, code: "NOT_LATEST" }, "NOT_LATEST"],
      [{ ok: false, code: "ALREADY_REVERTED", revertChangeSetId: "cs-9" }, "ALREADY_REVERTED"],
      [{ ok: false, code: "NOT_UNDOABLE", status: "external_pending" }, "EXTERNAL_PENDING"],
      [{ ok: false, code: "NOT_UNDOABLE", status: "rejected" }, "NOT_UNDOABLE"],
      [{ ok: false, code: "UNDO_UNSUPPORTED", proposalIds: ["cp-1"] }, "UNDO_UNSUPPORTED"],
    ];
    for (const [result, error] of cases) {
      h.changeSetQueue = [appliedCs];
      h.undo.mockResolvedValueOnce(result);
      const res = await undo();
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe(error);
    }
  });

  it("creates the reverting change set and audits it", async () => {
    h.changeSetQueue = [appliedCs];
    h.undo.mockResolvedValue({
      ok: true,
      changeSetId: "cs-3",
      versionId: "v3",
      versionNumber: 3,
      restoredVersionNumber: 1,
      revertedTasks: 2,
      externalNotReverted: 1,
    });
    const res = await undo();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      ok: true,
      revertedChangeSetId: "cs-2",
      changeSetId: "cs-3",
      versionNumber: 3,
      externalNotReverted: 1,
    });
    expect(h.undo).toHaveBeenCalledWith({ changeSetId: "cs-2", userId: "user-1" });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "plan.change_reverted", workspaceId: "ws-1" })
    );
  });

  it("hides internal errors behind a 500 with a request id", async () => {
    h.changeSetQueue = [appliedCs];
    h.undo.mockRejectedValue(new Error("db exploded"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await undo();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("UNDO_FAILED");
    expect(JSON.stringify(body)).not.toContain("exploded");
  });
});
