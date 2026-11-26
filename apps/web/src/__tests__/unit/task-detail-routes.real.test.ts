/**
 * Real route-handler tests for /api/tasks/[id] (GET / PATCH / DELETE).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verifySession: vi.fn(),
  budget: vi.fn(),
  audit: vi.fn(),
  selectRows: [] as unknown[],
  agentJob: undefined as unknown,
  pendingReview: undefined as unknown,
  repository: undefined as unknown,
  updated: [] as unknown[],
  updateSet: vi.fn(),
}));

vi.mock("@/lib/api-middleware", () => ({ verifySession: () => h.verifySession() }));
vi.mock("@/lib/production-guardrails", () => ({
  enforceMutationBudget: (...a: unknown[]) => h.budget(...a),
  isDemoEmail: (email: string) => email === "demo@nexus.dev",
  writeAuditLog: (...a: unknown[]) => h.audit(...a),
}));

vi.mock("@/lib/db", () => {
  const select = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "leftJoin", "where"]) b[m] = () => b;
    b.limit = async () => h.selectRows;
    return b;
  };
  return {
    db: {
      select,
      update: () => ({
        set: (v: unknown) => {
          h.updateSet(v);
          return { where: () => ({ returning: async () => h.updated }) };
        },
      }),
      query: {
        agentJobs: {
          // GET: latest job; PATCH -> done: job awaiting review
          findFirst: async () => h.pendingReview ?? h.agentJob,
        },
        workspaceRepositories: {
          findFirst: async () => h.repository,
        },
      },
    },
  };
});

import { GET, PATCH, DELETE } from "@/app/api/tasks/[id]/route";

const ID = "11111111-1111-1111-1111-111111111111";
const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const now = new Date("2026-11-20T10:00:00Z");
const task = {
  id: ID,
  workspaceId: "ws-1",
  docId: null,
  title: "Task",
  description: "d",
  status: "todo",
  priority: "medium",
  assigneeId: null,
  assigneeAgentType: null,
  dueDate: null,
  alignmentStatus: "aligned",
  isArchived: 0,
  createdAt: now,
  updatedAt: now,
};
const json = (method: string, body?: unknown) =>
  new Request(`http://localhost/api/tasks/${ID}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.verifySession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
  h.budget.mockResolvedValue(null);
  h.selectRows = [{ task }];
  h.agentJob = undefined;
  h.pendingReview = undefined;
  h.repository = undefined;
  h.updated = [{ ...task, title: "New", updatedAt: now }];
});

describe("GET /api/tasks/[id]", () => {
  it("400 for a non-UUID id", async () => {
    expect((await GET(json("GET"), params("nope"))).status).toBe(400);
  });
  it("401 without a session", async () => {
    h.verifySession.mockResolvedValue(null);
    expect((await GET(json("GET"), params())).status).toBe(401);
  });
  it("404 when the task is not in an accessible workspace", async () => {
    h.selectRows = [];
    expect((await GET(json("GET"), params())).status).toBe(404);
  });
  it("returns the task with its latest agent job", async () => {
    h.agentJob = { id: "job-1", status: "submitted" };
    const res = await GET(json("GET"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: ID,
      workspaceId: "ws-1",
      isArchived: false,
      agentJob: { id: "job-1" },
      agentHandoffWritable: true,
      agentRepositoryConfigured: false,
    });
  });
  it("reports whether the workspace has a repository for agent handoff", async () => {
    h.repository = { id: "repo-1" };
    expect((await (await GET(json("GET"), params())).json()).agentRepositoryConfigured).toBe(true);
  });
  it("marks agent handoff read-only for demo users", async () => {
    h.verifySession.mockResolvedValue({ user: { id: "u", email: "demo@nexus.dev" } });
    expect((await (await GET(json("GET"), params())).json()).agentHandoffWritable).toBe(false);
  });
});

describe("PATCH /api/tasks/[id]", () => {
  it("400 for a non-UUID id and 401 without a session", async () => {
    expect((await PATCH(json("PATCH", {}), params("x"))).status).toBe(400);
    h.verifySession.mockResolvedValue(null);
    expect((await PATCH(json("PATCH", { title: "a" }), params())).status).toBe(401);
  });
  it("returns the budget response when the mutation limit is hit", async () => {
    h.budget.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await PATCH(json("PATCH", { title: "a" }), params())).status).toBe(429);
  });
  it("400 on an invalid JSON body", async () => {
    expect((await PATCH(json("PATCH", "{bad"), params())).status).toBe(400);
  });
  it("404 when the task is not accessible", async () => {
    h.selectRows = [];
    expect((await PATCH(json("PATCH", { title: "a" }), params())).status).toBe(404);
  });
  it.each([
    [{ title: "" }],
    [{ status: "bogus" }],
    [{ priority: "bogus" }],
    [{}],
  ])("400 on invalid update %j", async (body) => {
    expect((await PATCH(json("PATCH", body), params())).status).toBe(400);
    expect(h.updateSet).not.toHaveBeenCalled();
  });
  it("409 when completing a task with an agent PR awaiting review", async () => {
    h.pendingReview = { id: "job-1", status: "submitted" };
    const res = await PATCH(json("PATCH", { status: "done" }), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "AGENT_REVIEW_REQUIRED" });
  });
  it("updates the task and sets completedAt when done", async () => {
    h.updated = [{ ...task, status: "done", updatedAt: now }];
    const res = await PATCH(json("PATCH", { status: "done" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("done");
    expect(h.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "done", completedAt: expect.any(Date) })
    );
  });
  it("restores an archived task with isArchived: false", async () => {
    h.updated = [{ ...task, isArchived: 0, updatedAt: now }];
    const res = await PATCH(json("PATCH", { isArchived: false }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).isArchived).toBe(false);
    expect(h.updateSet).toHaveBeenCalledWith(expect.objectContaining({ isArchived: 0 }));
  });
  it("400 when isArchived is not a boolean", async () => {
    expect((await PATCH(json("PATCH", { isArchived: "no" }), params())).status).toBe(400);
    expect(h.updateSet).not.toHaveBeenCalled();
  });
  it("updates the title", async () => {
    const res = await PATCH(json("PATCH", { title: "New" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("New");
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("400 / 401 / 404", async () => {
    expect((await DELETE(json("DELETE"), params("x"))).status).toBe(400);
    h.verifySession.mockResolvedValue(null);
    expect((await DELETE(json("DELETE"), params())).status).toBe(401);
    h.verifySession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    h.selectRows = [];
    expect((await DELETE(json("DELETE"), params())).status).toBe(404);
  });
  it("returns the budget response when limited", async () => {
    h.budget.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await DELETE(json("DELETE"), params())).status).toBe(429);
  });
  it("archives the task and writes an audit log", async () => {
    h.updated = [{ ...task, isArchived: 1 }];
    const res = await DELETE(json("DELETE"), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, archived: true });
    expect(h.updateSet).toHaveBeenCalledWith(expect.objectContaining({ isArchived: 1 }));
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: "task.archive", workspaceId: "ws-1" })
    );
  });
});
