/**
 * Real route-handler tests for GET /api/user-stats.
 *
 * Drives the actual handler: the auth gate, the empty-state shortcut for users
 * with no workspace, and the aggregation that sums per-workspace counts into
 * the dashboard stats payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

// Sequential select() mock: each awaited count query consumes the next result.
let selectResults: unknown[] = [];
let selectIndex = 0;
const workspacesFindMany = vi.fn();
const docsFindMany = vi.fn();

function selectChain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? [{ count: 0 }]).then(res, rej);
  return b;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: () => selectChain(),
    query: {
      workspaces: { findMany: (...a: unknown[]) => workspacesFindMany(...a) },
      docs: { findMany: (...a: unknown[]) => docsFindMany(...a) },
    },
  },
}));

import { GET } from "@/app/api/user-stats/route";

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  docsFindMany.mockResolvedValue([]);
});

describe("GET /api/user-stats (real handler)", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns zeroed stats when the user has no workspace", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    workspacesFindMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toMatchObject({ totalDocuments: 0, totalTasks: 0, activeWorkspaces: 0 });
    expect(body.recentActivity).toEqual([]);
  });

  it("aggregates per-workspace counts into the stats payload", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    workspacesFindMany.mockResolvedValue([{ id: "ws-1", ownerId: "user-1" }]);
    // Order the handler issues the counts in, for one workspace:
    // docs total, docs this week, tasks total, tasks done, tasks pending, tasks done this week
    selectResults = [
      [{ count: 3 }],
      [{ count: 1 }],
      [{ count: 5 }],
      [{ count: 2 }],
      [{ count: 3 }],
      [{ count: 1 }],
    ];
    docsFindMany.mockResolvedValue([
      { id: "d1", title: "Doc one", updatedAt: new Date("2026-06-10T00:00:00Z") },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toMatchObject({
      totalDocuments: 3,
      documentsCreatedThisWeek: 1,
      totalTasks: 5,
      completedTasks: 2,
      pendingTasks: 3,
      tasksCompletedThisWeek: 1,
      activeWorkspaces: 1,
    });
    expect(body.recentActivity).toHaveLength(1);
    expect(body.recentActivity[0]).toMatchObject({ type: "document_updated", documentId: "d1" });
  });
});
