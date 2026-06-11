/**
 * Real route-handler tests for GET /api/workspace.
 *
 * The local-first client calls this once (online) to learn its workspaceId so
 * optimistic offline writes can be attributed and pass the sync-push authz.
 * Guards the auth gate and the ensure-default-workspace happy path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

import { GET } from "@/app/api/workspace/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/workspace (real handler)", () => {
  it("returns 401 when there is no session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(ensureDefaultWorkspace).not.toHaveBeenCalled();
  });

  it("returns the default workspace id for an authenticated user", async () => {
    verifySession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    ensureDefaultWorkspace.mockResolvedValue({ id: "ws-1", name: "My Workspace" });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "ws-1", name: "My Workspace" });
    expect(ensureDefaultWorkspace).toHaveBeenCalledWith("user-1");
  });

  it("returns 500 when workspace resolution throws", async () => {
    verifySession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    ensureDefaultWorkspace.mockRejectedValue(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
