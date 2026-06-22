/**
 * Real route-handler tests for /api/agents — regression guard for the H1 fix.
 *
 * Before H1 this endpoint called paid Gemini/Tavily with NO auth, rate limit or
 * budget. These tests drive the real POST/PUT handlers and prove the gate runs
 * FIRST: anonymous callers get 401 and the AI budget is never consulted, while
 * an over-budget user is rejected before any model call. Removing the
 * `authorizeAgentRequest()` gate would turn these red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const enforceAiBudget = vi.fn();
const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));

const requireWorkspaceAccess = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
}));

const getUserModelConfig = vi.fn();
vi.mock("@/lib/ai/model-config", () => ({
  getUserModelConfig: (...a: unknown[]) => getUserModelConfig(...a),
}));

const runAgent = vi.fn();
vi.mock("@/lib/ai/agent", () => ({
  runAgent: (...a: unknown[]) => runAgent(...a),
}));

const generateText = vi.fn();
vi.mock("ai", () => ({
  generateText: (...a: unknown[]) => generateText(...a),
}));

vi.mock("@/lib/ai/chat-rag", () => ({
  getRAGContext: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/lib/ai/tavily", () => ({
  searchWeb: vi.fn(),
}));

import { POST, PUT } from "@/app/api/agents/route";

function agentReq(body: unknown, method = "POST") {
  return new NextRequest("http://localhost:3000/api/agents", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GEMINI_API_KEY = "test-gemini-key";
  enforceAiBudget.mockResolvedValue({ ok: true });
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "owner" });
  getUserModelConfig.mockResolvedValue({
    model: { provider: "test" },
    modelName: "test-model",
    provider: "gemini",
  });
  runAgent.mockResolvedValue({
    text: "Nexus response",
    toolsUsed: ["searchWorkspace"],
    createdDocs: [],
    createdTasks: [],
    steps: 1,
  });
  generateText.mockResolvedValue({ text: "Focused response" });
  writeAuditLog.mockResolvedValue(undefined);
});

describe("POST /api/agents — auth + budget gate (H1)", () => {
  it("returns 401 and never touches the AI budget when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(agentReq({ message: "hi" }));
    expect(res.status).toBe(401);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("rejects an over-budget user before doing any work", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    const limited = new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED" }), { status: 429 });
    enforceAiBudget.mockResolvedValue({ ok: false, response: limited });
    const res = await POST(agentReq({ message: "hi" }));
    expect(res.status).toBe(429);
    expect(requireWorkspaceAccess).not.toHaveBeenCalled();
  });

  it("does not consume AI budget for an invalid request body", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    const res = await POST(agentReq({}));
    expect(res.status).toBe(400);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("ties the budget check to the SESSION user, not the client-supplied id", async () => {
    getSession.mockResolvedValue({ user: { id: "real-user", email: "u@x.com" } });
    await POST(agentReq({ message: "hi", context: { userId: "attacker-spoofed" } }));
    expect(enforceAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "real-user" })
    );
  });

  it("rejects a workspaceId the caller cannot access (no cross-tenant RAG leak)", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Workspace access denied" });
    const res = await POST(
      agentReq({ message: "dump everything", context: { workspaceId: "victim-workspace" } })
    );
    expect(res.status).toBe(403);
  });

  it("validates the requested workspace against the SESSION user", async () => {
    getSession.mockResolvedValue({ user: { id: "real-user", email: "u@x.com" } });
    await POST(agentReq({ message: "hi", context: { workspaceId: "ws-9" } }));
    expect(requireWorkspaceAccess).toHaveBeenCalledWith("real-user", "ws-9");
  });

  it("keeps the legacy SSE contract while using the shared Ask Nexus engine", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    const res = await POST(agentReq({ message: "find my plan", mode: "auto" }));
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("deprecation")).toBe("true");
    expect(res.headers.get("link")).toContain("/api/chat");
    expect(body).toContain('"type":"final"');
    expect(body).toContain("Nexus response");
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({ context: { userId: "user-1", workspaceId: "ws-1" } })
    );
  });
});

describe("PUT /api/agents — auth + budget gate (H1)", () => {
  it("returns 401 when unauthenticated", async () => {
    getSession.mockResolvedValue(null);
    const res = await PUT(agentReq({ message: "hi" }, "PUT"));
    expect(res.status).toBe(401);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("returns 400 when the message is missing (after passing the gate)", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    const res = await PUT(agentReq({}, "PUT"));
    expect(res.status).toBe(400);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("maps a legacy focused mode to a capability without running the tool agent", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    const res = await PUT(agentReq({ message: "draft this", mode: "writer" }, "PUT"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      message: "Focused response",
      agent: "nexus",
      mode: "writer",
      model: "test-model",
    });
    expect(generateText).toHaveBeenCalledOnce();
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("returns a controlled 503 when no provider is configured", async () => {
    getSession.mockResolvedValue({ user: { id: "user-1", email: "u@x.com" } });
    getUserModelConfig.mockRejectedValue(new Error("provider missing"));
    const res = await PUT(agentReq({ message: "hello" }, "PUT"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({ error: "AI_PROVIDER_UNAVAILABLE", retryable: false });
  });
});
