/**
 * Real route-handler tests for /api/tasks.
 *
 * Unlike the legacy suites, these import the ACTUAL GET/POST handlers and run
 * them end-to-end with auth, workspace authorization, the database and audit
 * logging mocked at the module boundary. They lock in the behaviour that
 * matters for production: the auth gate (401), input validation (400) and the
 * happy path, all through the real code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Module mocks (the boundaries the handler depends on) ----------------
const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

const findMany = vi.fn();
const agentJobsFindMany = vi.fn();
const insertReturning = vi.fn();
let selectResults: unknown[] = [];
let selectIndex = 0;

function selectChain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    b[m] = () => b;
  }
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(res, rej);
  return b;
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      tasks: { findMany: (...a: unknown[]) => findMany(...a) },
      agentJobs: { findMany: (...a: unknown[]) => agentJobsFindMany(...a) },
    },
    select: () => selectChain(),
    insert: () => ({
      values: () => ({ returning: (...a: unknown[]) => insertReturning(...a) }),
    }),
  },
}));

const getAccessibleWorkspaceIds = vi.fn();
const requireWorkspaceAccess = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const writeAuditLog = vi.fn();
const enforceMutationBudget = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
  enforceMutationBudget: (...a: unknown[]) => enforceMutationBudget(...a),
}));

// Import the REAL handlers after the mocks are registered.
import { GET, POST } from "@/app/api/tasks/route";

const authed = {
  user: { id: "user-1", email: "user@example.com", name: "User" },
  session: { id: "s1", expiresAt: new Date(Date.now() + 1e6) },
};

function postRequest(body: unknown) {
  return new Request("http://localhost:3000/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  writeAuditLog.mockResolvedValue(undefined);
  enforceMutationBudget.mockResolvedValue(null);
  agentJobsFindMany.mockResolvedValue([]);
});

describe("GET /api/tasks (real handler)", () => {
  it("returns 401 when there is no session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/tasks"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list when the user has no accessible workspaces", async () => {
    getSession.mockResolvedValue(authed);
    getAccessibleWorkspaceIds.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost:3000/api/tasks"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("serializes tasks from accessible workspaces", async () => {
    getSession.mockResolvedValue(authed);
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1"]);
    findMany.mockResolvedValue([
      {
        id: "t1",
        workspaceId: "ws-1",
        title: "Task one",
        description: "d",
        status: "todo",
        priority: "medium",
        assigneeId: "user-1",
        assigneeAgentType: null,
        dueDate: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/tasks"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: "t1", title: "Task one", status: "todo" });
    expect(body[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("POST /api/tasks (real handler)", () => {
  it("returns 400 for invalid JSON body", async () => {
    getSession.mockResolvedValue(authed);
    const badReq = new Request("http://localhost:3000/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the title is missing", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(postRequest({ description: "no title" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the title exceeds 500 characters", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(postRequest({ title: "a".repeat(501) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid status", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(postRequest({ title: "ok", status: "archived" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated (after a valid body)", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(postRequest({ title: "Valid title" }));
    expect(res.status).toBe(401);
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("returns 429 when the mutation budget is exhausted", async () => {
    getSession.mockResolvedValue(authed);
    enforceMutationBudget.mockResolvedValue(
      Response.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 })
    );

    const res = await POST(postRequest({ title: "Valid title" }));
    expect(res.status).toBe(429);
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("creates a task and writes an audit log on the happy path", async () => {
    getSession.mockResolvedValue(authed);
    requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "owner" });
    insertReturning.mockResolvedValue([
      {
        id: "new-task",
        workspaceId: "ws-1",
        title: "Valid title",
        description: "",
        status: "todo",
        priority: "medium",
        assigneeId: "user-1",
        assigneeAgentType: null,
        createdAt: new Date("2026-06-10T00:00:00Z"),
      },
    ]);

    const res = await POST(postRequest({ title: "Valid title", workspaceId: "ws-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "new-task", title: "Valid title", status: "todo" });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "task.create", userId: "user-1", workspaceId: "ws-1" })
    );
  });

  it("denies creation when the requested workspace is not accessible", async () => {
    getSession.mockResolvedValue(authed);
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });

    const res = await POST(postRequest({ title: "Valid title", workspaceId: "other-ws" }));
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
});
