/**
 * Real route-handler tests for /api/sync/pull.
 *
 * Guards the offline-sync read path: the auth gate, the workspace-isolation
 * short-circuit (no data queries when the user has no accessible workspace),
 * and the client serialization (Date -> epoch ms). A regression that dropped
 * the workspace filter would let cross-tenant rows leak through pull; the
 * isolation test pins that the data fan-out only runs for accessible workspaces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { sync: { windowMs: 1000, maxRequests: 60, keyPrefix: "sync" } },
}));

// Sequential select mock: each awaited select() consumes the next queued result.
let selectResults: unknown[] = [];
let selectIndex = 0;
const selectCalls = vi.fn();

function selectChain() {
  selectCalls();
  const b: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "limit", "orderBy"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(res, rej);
  return b;
}

vi.mock("@/lib/db", () => ({
  db: { select: () => selectChain() },
}));

import { GET } from "@/app/api/sync/pull/route";

function pullReq(since?: number) {
  const url = since != null
    ? `http://localhost:3000/api/sync/pull?since=${since}`
    : "http://localhost:3000/api/sync/pull";
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  protectRoute.mockResolvedValue({ success: true, user: { id: "user-1", email: "u@x.com" } });
});

describe("GET /api/sync/pull (real handler)", () => {
  it("returns the protection response when auth/rate-limit fails", async () => {
    const blocked = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    protectRoute.mockResolvedValue({ success: false, response: blocked });
    const res = await GET(pullReq());
    expect(res.status).toBe(401);
  });

  it("short-circuits to empty payload when there are no accessible workspaces", async () => {
    selectResults = [[]]; // accessibleWorkspaces -> none
    const res = await GET(pullReq(0));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ docs: [], tasks: [], workspaces: [], chatMessages: [], agentExecutions: [] });
    expect(typeof body.lastSync).toBe("number");
    // Only the workspace lookup ran; the data fan-out was skipped (isolation gate).
    expect(selectCalls).toHaveBeenCalledTimes(1);
  });

  it("serializes records and converts Date fields to epoch ms", async () => {
    selectResults = [
      [{ id: "ws-1" }], // accessibleWorkspaces
      [{ id: "d1", workspaceId: "ws-1", title: "Doc", updatedAt: new Date("2026-03-03T00:00:00Z") }], // docs
      [], // tasks
      [], // workspaces
      [], // chatMessages
      [], // agentExecutions
    ];
    const res = await GET(pullReq(0));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.docs).toHaveLength(1);
    expect(body.docs[0]).toMatchObject({ id: "d1", workspaceId: "ws-1", title: "Doc" });
    expect(body.docs[0].updatedAt).toBe(new Date("2026-03-03T00:00:00Z").getTime());
    // 1 workspace lookup + 5 data queries.
    expect(selectCalls).toHaveBeenCalledTimes(6);
  });
});
