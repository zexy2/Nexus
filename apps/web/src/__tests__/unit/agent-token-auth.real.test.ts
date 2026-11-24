/**
 * Real tests for authenticateAgentToken: a token must stop working once its
 * creator no longer has access to the token's workspace.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const findFirst = vi.fn();
const updateWhere = vi.fn(async () => undefined);
vi.mock("@/lib/db", () => ({
  db: {
    query: { agentAccessTokens: { findFirst: (...a: unknown[]) => findFirst(...a) } },
    update: () => ({ set: () => ({ where: updateWhere }) }),
  },
}));

const requireWorkspaceAccess = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
}));

import { authenticateAgentToken } from "@/lib/agent-handoff";

const TOKEN = "nxs_agent_test-secret";
const row = {
  id: "tok-1",
  userId: "user-1",
  workspaceId: "ws-1",
  tokenHash: createHash("sha256").update(TOKEN).digest("hex"),
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
};

function request() {
  return new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${TOKEN}` } });
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(row);
});

describe("authenticateAgentToken", () => {
  it("accepts a token whose creator still has workspace access", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "owner" });

    await expect(authenticateAgentToken(request())).resolves.toEqual(row);
    expect(requireWorkspaceAccess).toHaveBeenCalledWith("user-1", "ws-1");
    expect(updateWhere).toHaveBeenCalledTimes(1); // lastUsedAt touched
  });

  it("rejects a token whose creator lost access to the workspace", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });

    await expect(authenticateAgentToken(request())).resolves.toBeNull();
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("rejects when the workspace no longer exists", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 404, error: "Workspace not found" });
    await expect(authenticateAgentToken(request())).resolves.toBeNull();
  });

  it("rejects expired tokens without a membership lookup", async () => {
    findFirst.mockResolvedValue({ ...row, expiresAt: new Date(Date.now() - 1) });
    await expect(authenticateAgentToken(request())).resolves.toBeNull();
    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
  });
});
