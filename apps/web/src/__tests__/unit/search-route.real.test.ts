/**
 * Real route-handler tests for GET /api/search.
 *
 * Drives the actual handler including its real scoring/highlight logic over
 * mocked workspace data: the missing-query 400, the auth/workspace gate, type
 * filtering, scoring+sorting, and the limit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const workspacesFindFirst = vi.fn();
const docsFindMany = vi.fn();
const tasksFindMany = vi.fn();
const selectWhere = vi.fn();
const selectLeftJoin = vi.fn(() => ({ where: selectWhere }));
const selectFrom = vi.fn(() => ({ leftJoin: selectLeftJoin }));
const dbSelect = vi.fn(() => ({ from: selectFrom }));
const rateLimitReturning = vi.fn();
const rateLimitOnConflictDoUpdate = vi.fn(() => ({ returning: rateLimitReturning }));
const rateLimitValues = vi.fn(() => ({ onConflictDoUpdate: rateLimitOnConflictDoUpdate }));
const dbInsert = vi.fn(() => ({ values: rateLimitValues }));
vi.mock("@/lib/db", () => ({
  db: {
    select: (...a: unknown[]) => dbSelect(...a),
    insert: (...a: unknown[]) => dbInsert(...a),
    query: {
      workspaces: { findFirst: (...a: unknown[]) => workspacesFindFirst(...a) },
      docs: { findMany: (...a: unknown[]) => docsFindMany(...a) },
      tasks: { findMany: (...a: unknown[]) => tasksFindMany(...a) },
    },
  },
}));

import { GET } from "@/app/api/search/route";

const authed = {
  user: { id: "user-1", email: "u@x.com", name: "User" },
  session: { id: "session-1", expiresAt: new Date("2026-06-10T01:00:00Z") },
};
const now = new Date("2026-06-10T00:00:00Z");

function searchReq(qs: string) {
  return new NextRequest(`http://localhost:3000/api/search?${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  docsFindMany.mockResolvedValue([]);
  tasksFindMany.mockResolvedValue([]);
  selectWhere.mockResolvedValue([{ id: "ws-1" }]);
  rateLimitReturning.mockResolvedValue([
    { count: 1, resetAt: new Date("2026-06-10T00:01:00Z") },
  ]);
});

describe("GET /api/search (real handler)", () => {
  it("returns 400 when the query is missing", async () => {
    getSession.mockResolvedValue(authed);
    const res = await GET(searchReq("type=all"));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated (no workspace)", async () => {
    getSession.mockResolvedValue(null);
    workspacesFindFirst.mockResolvedValue(undefined);
    const res = await GET(searchReq("q=hello"));
    expect(res.status).toBe(401);
  });

  it("scores and returns matching docs and tasks, sorted by score", async () => {
    getSession.mockResolvedValue(authed);
    workspacesFindFirst.mockResolvedValue({ id: "ws-1", ownerId: "user-1" });
    docsFindMany.mockResolvedValue([
      { id: "d1", title: "Roadmap planning", content: [], updatedAt: now },
      { id: "d2", title: "Unrelated note", content: [], updatedAt: now },
    ]);
    tasksFindMany.mockResolvedValue([
      { id: "t1", title: "Planning the roadmap", description: "roadmap roadmap", updatedAt: now },
    ]);

    const res = await GET(searchReq("q=roadmap"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("roadmap");
    const ids = body.results.map((r: { id: string }) => r.id);
    expect(ids).toContain("d1");
    expect(ids).toContain("t1");
    expect(ids).not.toContain("d2"); // no "roadmap" match -> score 0, excluded
    // sorted descending by score
    const scores = body.results.map((r: { score: number }) => r.score);
    expect([...scores]).toEqual([...scores].sort((a, b) => b - a));
  });

  it("restricts results to documents when type=document", async () => {
    getSession.mockResolvedValue(authed);
    workspacesFindFirst.mockResolvedValue({ id: "ws-1", ownerId: "user-1" });
    docsFindMany.mockResolvedValue([{ id: "d1", title: "roadmap", content: [], updatedAt: now }]);
    tasksFindMany.mockResolvedValue([{ id: "t1", title: "roadmap", description: "", updatedAt: now }]);

    const res = await GET(searchReq("q=roadmap&type=document"));
    const body = await res.json();
    expect(tasksFindMany).not.toHaveBeenCalled();
    expect(body.results.every((r: { type: string }) => r.type === "document")).toBe(true);
  });

  it("honours the limit parameter", async () => {
    getSession.mockResolvedValue(authed);
    workspacesFindFirst.mockResolvedValue({ id: "ws-1", ownerId: "user-1" });
    docsFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, title: "roadmap", content: [], updatedAt: now }))
    );
    const res = await GET(searchReq("q=roadmap&type=document&limit=2"));
    const body = await res.json();
    expect(body.results).toHaveLength(2);
  });
});
