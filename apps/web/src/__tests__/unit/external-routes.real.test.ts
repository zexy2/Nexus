/**
 * Real route-handler tests for GET /api/external-issues,
 * GET /api/external-pull-requests, GET /api/impact-graph and
 * GET /api/change-sets/[id].
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "../helpers/chain";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const issuesFindMany = vi.fn();
const prsFindMany = vi.fn();
const checksFindMany = vi.fn();
const opsFindMany = vi.fn();
const docsFindFirst = vi.fn();
const dbSelect = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...a: unknown[]) => dbSelect(...a),
    query: {
      externalIssues: { findMany: (...a: unknown[]) => issuesFindMany(...a) },
      externalPullRequests: { findMany: (...a: unknown[]) => prsFindMany(...a) },
      externalCheckRuns: { findMany: (...a: unknown[]) => checksFindMany(...a) },
      externalWriteOperations: { findMany: (...a: unknown[]) => opsFindMany(...a) },
      docs: { findFirst: (...a: unknown[]) => docsFindFirst(...a) },
    },
  },
}));

const requireWorkspaceAccess = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const buildImpactGraph = vi.fn();
vi.mock("@/lib/integrations/impact-graph", () => ({
  buildImpactGraph: (...a: unknown[]) => buildImpactGraph(...a),
}));

import { NextRequest } from "next/server";
import { GET as issuesGET } from "@/app/api/external-issues/route";
import { GET as prsGET } from "@/app/api/external-pull-requests/route";
import { GET as graphGET } from "@/app/api/impact-graph/route";
import { GET as changeSetGET } from "@/app/api/change-sets/[id]/route";

const authed = { user: { id: "user-1", email: "u@x.com", name: "U" } };
const req = (url: string) => new NextRequest(`http://localhost:3000${url}`);
const denied = { ok: false, status: 403, error: "Forbidden" };
const syncedAt = new Date("2026-03-01T00:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  verifySession.mockResolvedValue(authed);
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  ensureDefaultWorkspace.mockResolvedValue({ id: "ws-default" });
});

describe.each([
  ["external-issues", issuesGET],
  ["external-pull-requests", prsGET],
])("GET /api/%s gates", (name, handler) => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await handler(req(`/api/${name}`))).status).toBe(401);
  });

  it("forwards workspace access failures", async () => {
    requireWorkspaceAccess.mockResolvedValue(denied);
    expect((await handler(req(`/api/${name}?workspaceId=ws-x`))).status).toBe(403);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "ws-x");
  });
});

describe("GET /api/external-issues", () => {
  it("maps issues for the default workspace", async () => {
    issuesFindMany.mockResolvedValue([
      {
        id: "i1", provider: "linear", externalId: "x1", externalKey: "ENG-1", title: "Bug",
        description: "d", status: "open", priority: 2, url: "https://l/1", taskId: "t1",
        teamName: "Eng", projectName: "P", labels: ["a"], syncedAt, secretField: "nope",
      },
      { id: "i2", provider: "linear", externalId: "x2", externalKey: "ENG-2", title: "B", syncedAt: null },
    ]);
    const res = await issuesGET(req("/api/external-issues"));
    expect(res.status).toBe(200);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "ws-default");
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "i1", key: "ENG-1", syncedAt: syncedAt.toISOString() });
    expect(body[0]).not.toHaveProperty("secretField");
    expect(body[1].syncedAt).toBeNull();
  });
});

describe("GET /api/external-pull-requests", () => {
  it("returns an empty list without querying checks when there are no PRs", async () => {
    prsFindMany.mockResolvedValue([]);
    const res = await prsGET(req("/api/external-pull-requests"));
    expect(await res.json()).toEqual([]);
    expect(checksFindMany).not.toHaveBeenCalled();
  });

  it("attaches check runs to their pull request", async () => {
    prsFindMany.mockResolvedValue([
      { id: "p1", externalId: "e1", number: 7, title: "PR", status: "open", url: "u", branch: "b", baseBranch: "main", latestCommitSha: "abc", linkedExternalIssueIds: [], changedFiles: [], syncedAt },
      { id: "p2", externalId: "e2", number: 8, title: "PR2", status: "open", url: "u", branch: "b2", baseBranch: "main", latestCommitSha: "def", linkedExternalIssueIds: [], changedFiles: [], syncedAt: null },
    ]);
    checksFindMany.mockResolvedValue([
      { id: "c1", pullRequestId: "p1", name: "ci", status: "completed", conclusion: "success", url: "cu" },
    ]);
    const res = await prsGET(req("/api/external-pull-requests?workspaceId=ws-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].checks).toEqual([{ id: "c1", name: "ci", status: "completed", conclusion: "success", url: "cu" }]);
    expect(body[1].checks).toEqual([]);
    expect(body[1].syncedAt).toBeNull();
  });
});

describe("GET /api/impact-graph", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await graphGET(req("/api/impact-graph?docId=d1"))).status).toBe(401);
  });

  it("returns 400 when docId is missing", async () => {
    const res = await graphGET(req("/api/impact-graph"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("MISSING_DOC_ID");
  });

  it("returns 404 for a missing or archived document", async () => {
    docsFindFirst.mockResolvedValueOnce(undefined);
    expect((await graphGET(req("/api/impact-graph?docId=d1"))).status).toBe(404);
    docsFindFirst.mockResolvedValueOnce({ id: "d1", workspaceId: "ws-1", isArchived: 1 });
    expect((await graphGET(req("/api/impact-graph?docId=d1"))).status).toBe(404);
  });

  it("forwards workspace access failures", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1", workspaceId: "ws-9", isArchived: 0 });
    requireWorkspaceAccess.mockResolvedValue(denied);
    const res = await graphGET(req("/api/impact-graph?docId=d1"));
    expect(res.status).toBe(403);
    expect(buildImpactGraph).not.toHaveBeenCalled();
  });

  it("returns the impact graph", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1", workspaceId: "ws-1", isArchived: 0 });
    buildImpactGraph.mockResolvedValue({ nodes: [], edges: [] });
    const res = await graphGET(req("/api/impact-graph?docId=d1"));
    expect(res.status).toBe(200);
    expect(buildImpactGraph).toHaveBeenCalledWith("ws-1", "d1");
    expect(await res.json()).toEqual({ nodes: [], edges: [] });
  });
});

describe("GET /api/change-sets/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "cs-1" }) };
  const get = () => changeSetGET(req("/api/change-sets/cs-1"), ctx);
  const changeSet = {
    id: "cs-1", docId: "d1", workspaceId: "ws-1", status: "pending", summary: "s",
    stats: { added: 1 }, temporalWorkflowId: "wf-1", createdAt: syncedAt, resolvedAt: null,
  };
  const proposal = (over: Record<string, unknown> = {}) => ({
    proposal: {
      id: "p1", action: "create", title: "T", description: "D", priority: "high", rationale: "r",
      confidence: 0.8, status: "pending", metadata: {}, requirementId: "r1", taskId: null, ...over,
    },
    requirementKey: "REQ-1",
    requirementTitle: "Req",
    taskTitle: null,
    taskStatus: null,
    taskAlignmentStatus: null,
  });

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("returns 404 for an unknown change set", async () => {
    dbSelect.mockReturnValue(chain([]));
    expect((await get()).status).toBe(404);
  });

  it("forwards workspace access failures", async () => {
    dbSelect.mockReturnValue(chain([{ changeSet, docTitle: "Plan" }]));
    requireWorkspaceAccess.mockResolvedValue(denied);
    expect((await get()).status).toBe(403);
  });

  it("returns the change set with proposals and their external operations", async () => {
    dbSelect
      .mockReturnValueOnce(chain([{ changeSet, docTitle: "Plan" }]))
      .mockReturnValueOnce(chain([proposal(), proposal({ id: "p2", requirementId: null, taskId: "t1" })]));
    opsFindMany.mockResolvedValue([
      {
        id: "op1", changeProposalId: "p1", provider: "linear", operationType: "create_issue",
        status: "succeeded", syncStatus: "pending", syncError: null, error: null, response: {},
        attemptCount: 1, attemptedAt: syncedAt, completedAt: null,
      },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "cs-1", docTitle: "Plan", status: "pending", workflowId: "wf-1", resolvedAt: null,
    });
    expect(body.proposals).toHaveLength(2);
    expect(body.proposals[0].requirement).toEqual({ id: "r1", stableKey: "REQ-1", title: "Req" });
    expect(body.proposals[0].task).toBeNull();
    expect(body.proposals[0].externalOperations[0]).toMatchObject({ id: "op1", attemptedAt: syncedAt.toISOString() });
    expect(body.proposals[1].requirement).toBeNull();
    expect(body.proposals[1].task).toMatchObject({ id: "t1" });
    expect(body.proposals[1].externalOperations).toEqual([]);
  });

  it("skips the operations query when there are no proposals", async () => {
    dbSelect
      .mockReturnValueOnce(chain([{ changeSet, docTitle: "Plan" }]))
      .mockReturnValueOnce(chain([]));
    const res = await get();
    expect((await res.json()).proposals).toEqual([]);
    expect(opsFindMany).not.toHaveBeenCalled();
  });
});
