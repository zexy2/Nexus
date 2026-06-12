/**
 * Regression tests for the C1 fix: cross-tenant overwrite via /api/sync/push.
 *
 * These drive the REAL POST handler. Because inserts are upserts keyed on the
 * client-supplied id, a user must not be able to "insert" a row whose id already
 * belongs to a workspace they cannot access — doing so would overwrite another
 * tenant's record. The first test would FAIL against the pre-fix code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Auth + rate limit are mocked to a fixed authenticated user.
const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { sync: { windowMs: 1000, maxRequests: 60, keyPrefix: "sync" } },
}));

// Flexible chainable db mock: each awaited select() consumes the next queued
// result; insert/update/delete are spies that resolve.
const insertSpy = vi.fn();
let selectResults: unknown[] = [];
let selectIndex = 0;

function chain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "limit", "orderBy"]) {
    b[m] = () => b;
  }
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(resolve, reject);
  return b;
}

const valuesSpy = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => chain(),
    insert: () => ({
      values: (data: unknown) => {
        valuesSpy(data);
        return {
          onConflictDoUpdate: (...a: unknown[]) => {
            insertSpy(...a);
            return Promise.resolve(undefined);
          },
        };
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
    delete: () => ({ where: () => Promise.resolve(undefined) }),
  },
}));

import { POST } from "@/app/api/sync/push/route";

function syncRequest(body: unknown) {
  return new Request("http://localhost:3000/api/sync/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  // Authenticated as user-1.
  protectRoute.mockResolvedValue({ success: true, user: { id: "user-1", email: "u@x.com" } });
});

describe("POST /api/sync/push — cross-tenant insert protection (C1)", () => {
  it("rejects an insert whose id belongs to an inaccessible workspace", async () => {
    selectResults = [
      [{ id: "ws-1" }], // getAccessibleWorkspaceIds -> user owns ws-1
      [{ workspaceId: "ws-2" }], // findRecordWorkspaceId(docs, victim-doc) -> belongs to ws-2
    ];

    const res = await POST(
      syncRequest({
        id: "m1",
        table: "docs",
        operation: "insert",
        data: { id: "victim-doc", workspaceId: "ws-1", title: "pwned" },
        timestamp: Date.now(),
      }) as never
    );

    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled(); // never reached the write
  });

  it("allows a genuine new insert into an accessible workspace", async () => {
    selectResults = [
      [{ id: "ws-1" }], // accessible workspaces
      [], // no existing record with that id
    ];

    const res = await POST(
      syncRequest({
        id: "m2",
        table: "docs",
        operation: "insert",
        data: { id: "brand-new-doc", workspaceId: "ws-1", title: "ok" },
        timestamp: Date.now(),
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("coerces a boolean isArchived to the integer the column expects", async () => {
    selectResults = [[{ id: "ws-1" }], []];

    const res = await POST(
      syncRequest({
        id: "m-arch",
        table: "docs",
        operation: "insert",
        // The client models isArchived as a boolean; docs.is_archived is integer.
        data: { id: "doc-arch", workspaceId: "ws-1", title: "x", isArchived: false },
        timestamp: Date.now(),
      }) as never
    );

    expect(res.status).toBe(200);
    const inserted = valuesSpy.mock.calls[0][0] as { isArchived: unknown };
    expect(inserted.isArchived).toBe(0); // not `false`
  });

  it("allows re-syncing (upserting) a row in the user's own workspace", async () => {
    selectResults = [
      [{ id: "ws-1" }], // accessible workspaces
      [{ workspaceId: "ws-1" }], // existing record is in the same accessible workspace
    ];

    const res = await POST(
      syncRequest({
        id: "m3",
        table: "docs",
        operation: "insert",
        data: { id: "my-doc", workspaceId: "ws-1", title: "updated" },
        timestamp: Date.now(),
      }) as never
    );

    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects inserts into a workspace the user cannot access", async () => {
    selectResults = [
      [{ id: "ws-1" }], // user only has ws-1
    ];

    const res = await POST(
      syncRequest({
        id: "m4",
        table: "docs",
        operation: "insert",
        data: { id: "x", workspaceId: "ws-999", title: "nope" },
        timestamp: Date.now(),
      }) as never
    );

    expect(res.status).toBe(403);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown table", async () => {
    const res = await POST(
      syncRequest({
        id: "m5",
        table: "secrets",
        operation: "insert",
        data: {},
        timestamp: Date.now(),
      }) as never
    );
    expect(res.status).toBe(400);
  });
});
