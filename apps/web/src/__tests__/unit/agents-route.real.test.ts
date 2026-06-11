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
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
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
  });

  it("ties the budget check to the SESSION user, not the client-supplied id", async () => {
    getSession.mockResolvedValue({ user: { id: "real-user", email: "u@x.com" } });
    await POST(agentReq({ message: "hi", context: { userId: "attacker-spoofed" } }));
    expect(enforceAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "real-user" })
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
  });
});
