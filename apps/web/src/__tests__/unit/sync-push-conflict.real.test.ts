/**
 * Field-level conflict handling in /api/sync/push (real handler, db mocked).
 *
 * Select order for a docs/tasks update with `base`:
 *   1. accessible workspaces
 *   2. existing-row lookup (id/workspaceId/...)
 *   3. full row under FOR UPDATE inside the transaction
 * On rejection the route additionally loads the current row for the client:
 *   4. accessible workspaces, 5. full row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { sync: { windowMs: 1000, maxRequests: 60, keyPrefix: "sync" } },
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  checkPersistentRateLimit: async () => ({ allowed: true, limit: 60, remaining: 59, resetAt: 0 }),
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
  rateLimitResponse: () => new Response("{}", { status: 429 }),
}));

let selectResults: unknown[] = [];
let selectIndex = 0;
const forUpdate = vi.fn();

function chain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "limit", "orderBy"]) b[m] = () => b;
  b.for = (mode: string) => {
    forUpdate(mode);
    return b;
  };
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(resolve, reject);
  return b;
}

const updateSetSpy = vi.fn();
const transactionSpy = vi.fn();
const agentJobsFindFirst = vi.fn();

const dbMock = {
  select: () => chain(),
  update: () => ({
    set: (data: unknown) => {
      updateSetSpy(data);
      return { where: () => Promise.resolve(undefined) };
    },
  }),
  query: { agentJobs: { findFirst: (...a: unknown[]) => agentJobsFindFirst(...a) } },
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    transactionSpy();
    return fn(dbMock);
  },
};
vi.mock("@/lib/db", () => ({
  get db() {
    return dbMock;
  },
}));

import { POST } from "@/app/api/sync/push/route";

function push(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/sync/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "m1", timestamp: Date.now(), ...body }),
    }) as never
  );
}

const serverTask = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  workspaceId: "ws-1",
  title: "Renamed by B",
  description: "desc",
  status: "todo",
  priority: "medium",
  docId: null,
  assigneeId: null,
  dueDate: null,
  isArchived: 0,
  embedding: [0.1, 0.2],
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  protectRoute.mockResolvedValue({ success: true, user: { id: "user-1", email: "u@x.com" } });
  agentJobsFindFirst.mockResolvedValue(undefined);
});

describe("POST /api/sync/push — base-aware updates", () => {
  it("stale base field conflict handled", async () => {
    const current = serverTask(); // B renamed "Original" -> "Renamed by B"
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "t1", workspaceId: "ws-1", status: "todo", docId: null, assigneeId: null }],
      [current],
      [{ id: "ws-1" }], // loadCurrentForClient
      [current],
    ];

    const res = await push({
      table: "tasks",
      operation: "update",
      data: { id: "t1", workspaceId: "ws-1", title: "Renamed by A" },
      base: { updatedAt: 1, fields: { title: "Original" } },
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("STALE_BASE");
    expect(body.conflicts).toEqual(["title"]);
    expect(body.current).toMatchObject({ id: "t1", title: "Renamed by B" });
    expect(body.current.embedding).toBeUndefined();
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(forUpdate).toHaveBeenCalledWith("update");
  });

  it("applies a change to a different field than the concurrent edit (per-field merge)", async () => {
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "t1", workspaceId: "ws-1", status: "todo" }],
      [serverTask()], // title changed by B, status untouched
    ];

    const res = await push({
      table: "tasks",
      operation: "update",
      data: { id: "t1", workspaceId: "ws-1", status: "in_progress" },
      base: { updatedAt: 1, fields: { status: "todo" } },
    });

    expect(res.status).toBe(200);
    expect(transactionSpy).toHaveBeenCalledTimes(1);
    const written = updateSetSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({ status: "in_progress", completedAt: null });
    expect(written).not.toHaveProperty("title"); // B's rename is left alone
  });

  it("treats an equal server value as no conflict, and normalizes dates and booleans", async () => {
    const due = new Date("2026-06-01T00:00:00Z");
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "t1", workspaceId: "ws-1", status: "todo" }],
      [serverTask({ title: "Same", dueDate: due, isArchived: 0, content: { b: 1, a: 2 } })],
    ];

    const res = await push({
      table: "tasks",
      operation: "update",
      data: { id: "t1", title: "Same", dueDate: due.getTime(), isArchived: true },
      base: { fields: { title: "Old", dueDate: due.getTime(), isArchived: false } },
    });

    expect(res.status).toBe(200);
    expect(updateSetSpy.mock.calls[0][0]).toMatchObject({ title: "Same", isArchived: 1 });
  });

  it("keeps the PR-review gate on the base path, using the locked row", async () => {
    agentJobsFindFirst.mockResolvedValue({ id: "job-1" });
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "t1", workspaceId: "ws-1", status: "todo" }],
      [serverTask({ status: "in_review" })],
    ];

    const res = await push({
      table: "tasks",
      operation: "update",
      data: { id: "t1", status: "done" },
      base: { fields: { status: "in_review" } },
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("AGENT_REVIEW_REQUIRED");
    expect(updateSetSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed base with 400", async () => {
    const res = await push({ table: "tasks", operation: "update", data: { id: "t1" }, base: { fields: "nope" } });
    expect(res.status).toBe(400);
  });

  it("old-client whole-row push still accepted", async () => {
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "t1", workspaceId: "ws-1", status: "todo", docId: null, assigneeId: null }],
    ];

    // Exactly what the pre-change client sends: the whole cached row, no base.
    const res = await push({
      table: "tasks",
      operation: "update",
      data: {
        id: "t1",
        workspaceId: "ws-1",
        title: "Whole row",
        description: "d",
        status: "in_progress",
        priority: "high",
        createdBy: "someone",
        alignmentStatus: "aligned",
        createdAt: 1,
        updatedAt: 2,
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, mutationId: "m1" });
    expect(transactionSpy).not.toHaveBeenCalled(); // legacy path, no conflict check
    const written = updateSetSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(written).toMatchObject({ title: "Whole row", description: "d", status: "in_progress", priority: "high" });
    expect(written).not.toHaveProperty("createdBy");
    expect(written).not.toHaveProperty("alignmentStatus");
  });
});

describe("POST /api/sync/push — doc favorites", () => {
  const serverDoc = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    workspaceId: "ws-1",
    parentId: null,
    title: "Plan",
    isArchived: 0,
    isFavorite: 0,
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...over,
  });

  it("writes isFavorite as 0/1, treating a missing cached base as 0", async () => {
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "d1", workspaceId: "ws-1", parentId: null }],
      [serverDoc()],
    ];

    // A cache written before the column existed has no isFavorite: base null.
    const res = await push({
      table: "docs",
      operation: "update",
      data: { id: "d1", workspaceId: "ws-1", isFavorite: true },
      base: { updatedAt: 1, fields: { isFavorite: null } },
    });

    expect(res.status).toBe(200);
    expect(updateSetSpy.mock.calls[0][0]).toMatchObject({ isFavorite: 1 });
  });

  it("rejects a non-boolean isFavorite", async () => {
    selectResults = [
      [{ id: "ws-1" }],
      [{ id: "d1", workspaceId: "ws-1", parentId: null }],
      [serverDoc()],
    ];

    const res = await push({
      table: "docs",
      operation: "update",
      data: { id: "d1", workspaceId: "ws-1", isFavorite: "yes" },
      base: { updatedAt: 1, fields: { isFavorite: 0 } },
    });

    expect(res.status).toBe(400);
    expect(updateSetSpy).not.toHaveBeenCalled();
  });
});
