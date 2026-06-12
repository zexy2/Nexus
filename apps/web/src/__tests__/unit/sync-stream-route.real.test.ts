/**
 * Real route-handler tests for GET /api/sync/stream (realtime SSE).
 *
 * Covers the gates and the stream handshake: 401 without a session, 503 without
 * a database, and a text/event-stream response that opens a workspace-scoped
 * Postgres LISTEN and emits the initial "ready" event. The Postgres client is
 * mocked so no real connection is needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const getAccessibleWorkspaceIds = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
}));

const listen = vi.fn(async () => ({ unlisten: vi.fn(async () => {}) }));
const end = vi.fn(async () => {});
const postgresFactory = vi.fn(() => ({ listen, end }));
vi.mock("postgres", () => ({ default: (...a: unknown[]) => postgresFactory(...a) }));

import { GET } from "@/app/api/sync/stream/route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://x:x@localhost:5432/x";
  verifySession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
  getAccessibleWorkspaceIds.mockResolvedValue(["ws-1", "ws-2"]);
});

describe("GET /api/sync/stream (real handler)", () => {
  it("returns 401 without a session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 503 when no database is configured", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("opens an event-stream, subscribes to Postgres, and sends 'ready'", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain("event: ready");

    // It scoped the LISTEN to the caller's workspaces and opened a connection.
    expect(getAccessibleWorkspaceIds).toHaveBeenCalledWith("user-1");
    expect(postgresFactory).toHaveBeenCalled();
    expect(listen).toHaveBeenCalledWith("nexus_changes", expect.any(Function));

    await reader.cancel(); // triggers stream cancel -> cleanup
  });
});
