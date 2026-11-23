/**
 * Real route-handler tests for the agent-* API routes:
 * /api/agent-jobs, /api/agent-jobs/[id], /api/agent-jobs/[id]/refresh-context,
 * /api/agent-settings, /api/agent-tokens, /api/agent-tokens/[id],
 * /api/agents/executions and /api/approvals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "../helpers/chain";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const agentJobsFindMany = vi.fn();
const agentJobsFindFirst = vi.fn();
const repoFindFirst = vi.fn();
const tokensFindMany = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();
const dbUpdate = vi.fn();
const dbTransaction = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      agentJobs: {
        findMany: (...a: unknown[]) => agentJobsFindMany(...a),
        findFirst: (...a: unknown[]) => agentJobsFindFirst(...a),
      },
      workspaceRepositories: { findFirst: (...a: unknown[]) => repoFindFirst(...a) },
      agentAccessTokens: { findMany: (...a: unknown[]) => tokensFindMany(...a) },
    },
    select: (...a: unknown[]) => dbSelect(...a),
    insert: (...a: unknown[]) => dbInsert(...a),
    update: (...a: unknown[]) => dbUpdate(...a),
    transaction: (...a: unknown[]) => dbTransaction(...a),
  },
}));

const getAccessibleWorkspaceIds = vi.fn();
const requireWorkspaceAccess = vi.fn();
const requireWorkspaceOwner = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
  requireWorkspaceOwner: (...a: unknown[]) => requireWorkspaceOwner(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const getAgentJobDetail = vi.fn();
const buildAgentContext = vi.fn();
vi.mock("@/lib/agent-handoff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent-handoff")>();
  return {
    ...actual,
    getAgentJobDetail: (...a: unknown[]) => getAgentJobDetail(...a),
    buildAgentContext: (...a: unknown[]) => buildAgentContext(...a),
  };
});

const writeAuditLog = vi.fn();
const isDemoEmail = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
  isDemoEmail: (...a: unknown[]) => isDemoEmail(...a),
}));

const reconcile = vi.fn();
vi.mock("@/lib/workflow-reconcile", () => ({
  reconcileRunningWorkflowExecutions: (...a: unknown[]) => reconcile(...a),
}));
const expireStale = vi.fn();
vi.mock("@/lib/command-lease", () => ({
  expireStaleCommandExecutions: (...a: unknown[]) => expireStale(...a),
}));

import { NextRequest } from "next/server";
import { GET as jobsGET } from "@/app/api/agent-jobs/route";
import { GET as jobGET } from "@/app/api/agent-jobs/[id]/route";
import { POST as refreshPOST } from "@/app/api/agent-jobs/[id]/refresh-context/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/agent-settings/route";
import { GET as tokensGET, POST as tokensPOST } from "@/app/api/agent-tokens/route";
import { DELETE as tokenDELETE } from "@/app/api/agent-tokens/[id]/route";
import {
  GET as executionsGET,
  POST as executionsPOST,
  PATCH as executionsPATCH,
} from "@/app/api/agents/executions/route";
import { GET as approvalsGET, POST as approvalsPOST } from "@/app/api/approvals/route";

const authed = { user: { id: "user-1", email: "u@x.com", name: "U" }, session: { id: "s", expiresAt: new Date() } };
const ctx = (id = "job-1") => ({ params: Promise.resolve({ id }) });
const req = (url: string, init?: RequestInit) => new NextRequest(`http://localhost:3000${url}`, init as never);
const jsonReq = (url: string, method: string, body: unknown) =>
  req(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  verifySession.mockResolvedValue(authed);
  isDemoEmail.mockReturnValue(false);
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  requireWorkspaceOwner.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  ensureDefaultWorkspace.mockResolvedValue({ id: "ws-default" });
});

describe("GET /api/agent-jobs", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await jobsGET(req("/api/agent-jobs"))).status).toBe(401);
  });

  it("lists jobs with their tasks across accessible workspaces", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1"]);
    agentJobsFindMany.mockResolvedValue([{ id: "j1", taskId: "t1" }, { id: "j2", taskId: "t2" }]);
    dbSelect.mockReturnValue(chain([{ id: "t1", title: "Task 1" }]));
    const res = await jobsGET(req("/api/agent-jobs"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "j1", taskId: "t1", task: { id: "t1", title: "Task 1" } },
      { id: "j2", taskId: "t2", task: null },
    ]);
  });

  it("returns an empty list when the requested workspace is not accessible", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await jobsGET(req("/api/agent-jobs?workspaceId=other"));
    expect(await res.json()).toEqual([]);
    expect(agentJobsFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent-jobs/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await jobGET(req("/api/agent-jobs/job-1"), ctx())).status).toBe(401);
  });

  it("returns 404 for an unknown job", async () => {
    agentJobsFindFirst.mockResolvedValue(undefined);
    expect((await jobGET(req("/api/agent-jobs/job-1"), ctx())).status).toBe(404);
  });

  it("forwards the workspace access failure", async () => {
    agentJobsFindFirst.mockResolvedValue({ id: "job-1", workspaceId: "ws-9" });
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await jobGET(req("/api/agent-jobs/job-1"), ctx());
    expect(res.status).toBe(403);
    expect(getAgentJobDetail).not.toHaveBeenCalled();
  });

  it("returns the job detail", async () => {
    agentJobsFindFirst.mockResolvedValue({ id: "job-1", workspaceId: "ws-1" });
    getAgentJobDetail.mockResolvedValue({ job: { id: "job-1" }, events: [] });
    const res = await jobGET(req("/api/agent-jobs/job-1"), ctx());
    expect(res.status).toBe(200);
    expect(getAgentJobDetail).toHaveBeenCalledWith("job-1", "ws-1");
    expect(await res.json()).toEqual({ job: { id: "job-1" }, events: [] });
  });
});

describe("POST /api/agent-jobs/[id]/refresh-context", () => {
  const outdated = { id: "job-1", workspaceId: "ws-1", taskId: "t1", status: "outdated", contextVersion: 2 };
  const fresh = {
    contextHash: "h2",
    snapshot: { a: 1 },
    planVersionId: "pv",
    repository: { id: "repo-1" },
  };
  const post = () => refreshPOST(jsonReq("/api/agent-jobs/job-1/refresh-context", "POST", {}), ctx());

  function runTransaction(updatedRow: unknown) {
    dbTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        update: () => chain([updatedRow].filter(Boolean)),
        insert: () => chain([]),
      })
    );
  }

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("returns 404 for an unknown job", async () => {
    agentJobsFindFirst.mockResolvedValue(undefined);
    expect((await post()).status).toBe(404);
  });

  it("forwards workspace access failures", async () => {
    agentJobsFindFirst.mockResolvedValue(outdated);
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    expect((await post()).status).toBe(403);
  });

  it("returns 409 when the job is not outdated", async () => {
    agentJobsFindFirst.mockResolvedValue({ ...outdated, status: "queued" });
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("JOB_NOT_OUTDATED");
    expect(buildAgentContext).not.toHaveBeenCalled();
  });

  it("re-queues an outdated job and audits it", async () => {
    agentJobsFindFirst.mockResolvedValue(outdated);
    buildAgentContext.mockResolvedValue(fresh);
    runTransaction({ id: "job-1", status: "queued", contextVersion: 3, contextHash: "h2" });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).job.status).toBe("queued");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "agent.context_refreshed", workspaceId: "ws-1" })
    );
  });

  it("returns 409 when a concurrent change already moved the job", async () => {
    agentJobsFindFirst.mockResolvedValue(outdated);
    buildAgentContext.mockResolvedValue(fresh);
    runTransaction(null);
    const res = await post();
    expect(res.status).toBe(409);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("maps the active-job unique violation to ACTIVE_AGENT_JOB_EXISTS", async () => {
    agentJobsFindFirst.mockResolvedValue(outdated);
    buildAgentContext.mockResolvedValue(fresh);
    dbTransaction.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "23505", constraint_name: "agent_jobs_task_active_idx" })
    );
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("ACTIVE_AGENT_JOB_EXISTS");
  });
});

describe("/api/agent-settings", () => {
  it("GET returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await settingsGET(req("/api/agent-settings"))).status).toBe(401);
  });

  it("GET forwards a workspace owner check failure", async () => {
    requireWorkspaceOwner.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    expect((await settingsGET(req("/api/agent-settings?workspaceId=ws-x"))).status).toBe(403);
  });

  it("GET returns the repository of the default workspace", async () => {
    repoFindFirst.mockResolvedValue({ id: "repo-1" });
    const res = await settingsGET(req("/api/agent-settings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workspaceId: "ws-default", repository: { id: "repo-1" } });
  });

  it("PUT returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await settingsPUT(jsonReq("/api/agent-settings", "PUT", {}))).status).toBe(401);
  });

  it("PUT is read-only for demo users", async () => {
    isDemoEmail.mockReturnValue(true);
    const res = await settingsPUT(jsonReq("/api/agent-settings", "PUT", {}));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("DEMO_AGENT_SETTINGS_READ_ONLY");
  });

  it("PUT rejects an invalid repository URL", async () => {
    const res = await settingsPUT(
      jsonReq("/api/agent-settings", "PUT", { repositoryUrl: "https://example.com/a/b" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_REPOSITORY");
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("PUT rejects an invalid branch name", async () => {
    const res = await settingsPUT(
      jsonReq("/api/agent-settings", "PUT", { repositoryUrl: "https://github.com/o/r", defaultBranch: "bad branch!" })
    );
    expect(res.status).toBe(400);
  });

  it("PUT forwards an owner check failure", async () => {
    requireWorkspaceOwner.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await settingsPUT(
      jsonReq("/api/agent-settings", "PUT", { workspaceId: "ws-x", repositoryUrl: "https://github.com/o/r" })
    );
    expect(res.status).toBe(403);
  });

  it("PUT upserts the repository and writes an audit log", async () => {
    dbInsert.mockReturnValue(chain([{ id: "repo-1", repositoryOwner: "o", repositoryName: "r" }]));
    const res = await settingsPUT(
      jsonReq("/api/agent-settings", "PUT", { repositoryUrl: "https://github.com/o/r.git", defaultBranch: "dev" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).repository.id).toBe("repo-1");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "agent.repository_configured",
        metadata: { repository: "https://github.com/o/r", defaultBranch: "dev" },
      })
    );
  });
});

describe("/api/agent-tokens", () => {
  it("GET returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await tokensGET(req("/api/agent-tokens"))).status).toBe(401);
  });

  it("GET forwards an owner check failure", async () => {
    requireWorkspaceOwner.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    expect((await tokensGET(req("/api/agent-tokens?workspaceId=ws-x"))).status).toBe(403);
  });

  it("GET lists tokens without leaking the hash", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    tokensFindMany.mockResolvedValue([
      {
        id: "tok-1", name: "CLI", tokenPrefix: "nxa_abc", tokenHash: "secret-hash",
        scopes: ["agent:read"], expiresAt: now, lastUsedAt: null, revokedAt: null, createdAt: now,
      },
    ]);
    const res = await tokensGET(req("/api/agent-tokens"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0]).toMatchObject({ id: "tok-1", prefix: "nxa_abc", lastUsedAt: null });
    expect(JSON.stringify(body)).not.toContain("secret-hash");
  });

  it("POST returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await tokensPOST(jsonReq("/api/agent-tokens", "POST", {}))).status).toBe(401);
  });

  it("POST is disabled for demo users", async () => {
    isDemoEmail.mockReturnValue(true);
    const res = await tokensPOST(jsonReq("/api/agent-tokens", "POST", {}));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("DEMO_TOKEN_DISABLED");
  });

  it("POST requires a configured repository", async () => {
    repoFindFirst.mockResolvedValue(undefined);
    const res = await tokensPOST(jsonReq("/api/agent-tokens", "POST", {}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("REPOSITORY_NOT_CONFIGURED");
  });

  it("POST forwards an owner check failure", async () => {
    requireWorkspaceOwner.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    expect((await tokensPOST(jsonReq("/api/agent-tokens", "POST", { workspaceId: "ws-x" }))).status).toBe(403);
  });

  it("POST creates a token, returning the plaintext once and storing only a hash", async () => {
    repoFindFirst.mockResolvedValue({ id: "repo-1" });
    const values = vi.fn();
    dbInsert.mockReturnValue({
      values: (v: unknown) => {
        values(v);
        return chain([{ id: "tok-1" }]);
      },
    });
    const res = await tokensPOST(jsonReq("/api/agent-tokens", "POST", { name: "  My agent  " }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("tok-1");
    expect(typeof body.token).toBe("string");
    const stored = values.mock.calls[0]![0] as Record<string, unknown>;
    expect(stored.name).toBe("My agent");
    expect(stored.tokenHash).not.toBe(body.token);
    expect(JSON.stringify(stored)).not.toContain(body.token);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ event: "agent.token_created" }));
  });
});

describe("DELETE /api/agent-tokens/[id]", () => {
  const del = () => tokenDELETE(req("/api/agent-tokens/tok-1", { method: "DELETE" }), ctx("tok-1"));

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
  });

  it("returns 404 when the token is not owned by the caller", async () => {
    dbUpdate.mockReturnValue(chain([]));
    expect((await del()).status).toBe(404);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("revokes the token and audits it", async () => {
    dbUpdate.mockReturnValue(chain([{ id: "tok-1", workspaceId: "ws-1" }]));
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "agent.token_revoked", workspaceId: "ws-1" })
    );
  });
});

describe("/api/agents/executions", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "e1", workspaceId: "ws-1", agentType: "writer", status: "completed",
    input: {}, output: {}, errorMessage: null, temporalWorkflowId: "wf-1",
    startedAt: new Date(1000), heartbeatAt: null, completedAt: new Date(3500),
    createdAt: new Date(500), ...over,
  });

  it("GET returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    expect((await executionsGET(req("/api/agents/executions"))).status).toBe(401);
  });

  it("GET returns [] when the user has no workspaces", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    dbSelect.mockReturnValue(chain([]));
    const res = await executionsGET(req("/api/agents/executions"));
    expect(await res.json()).toEqual([]);
  });

  it("GET returns executions with computed durations", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    dbSelect
      .mockReturnValueOnce(chain([{ id: "ws-1" }]))
      .mockReturnValueOnce(chain([row()]));
    expireStale.mockImplementation(async (rows: unknown) => rows);
    reconcile.mockImplementation(async (rows: unknown) => rows);
    const res = await executionsGET(req("/api/agents/executions?status=completed&workspaceId=ws-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "e1", duration: "2.5s", error: null, workflowId: "wf-1" });
  });

  it("GET returns 500 when the query fails", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    dbSelect.mockImplementation(() => {
      throw new Error("db down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await executionsGET(req("/api/agents/executions"));
    spy.mockRestore();
    expect(res.status).toBe(500);
  });

  it("POST and PATCH are read-only", async () => {
    for (const handler of [executionsPOST, executionsPATCH]) {
      const res = await handler(jsonReq("/api/agents/executions", "POST", {}));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("WORKFLOW_HISTORY_READ_ONLY");
    }
  });
});

describe("/api/approvals", () => {
  it("GET and POST are permanently disabled (410)", async () => {
    for (const handler of [approvalsGET, approvalsPOST]) {
      const res = await handler();
      expect(res.status).toBe(410);
      expect((await res.json()).error).toBe("APPROVALS_API_DISABLED");
    }
  });
});
