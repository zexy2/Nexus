/**
 * Real route-handler tests for /api/chat (post-split).
 *
 * Exercises the actual POST handler's gate logic: auth (401), AI budget (429),
 * malformed JSON (400), the new messages validation (400 — previously an
 * unhandled crash/500), and provider-unavailable (503). Collaborator modules
 * are mocked at their boundaries.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const getUserModelConfig = vi.fn();
vi.mock("@/lib/ai/model-config", () => ({
  getUserModelConfig: (...a: unknown[]) => getUserModelConfig(...a),
}));

vi.mock("@/lib/ai/chat-rag", () => ({ getRAGContext: vi.fn().mockResolvedValue("") }));
vi.mock("@/lib/ai/chat-actions", () => ({
  applyAutoSave: vi.fn(async (o: { finalResponse: string }) => o.finalResponse),
  createDocument: vi.fn(),
}));
vi.mock("@/lib/ai/tavily", () => ({ searchWeb: vi.fn() }));
vi.mock("@/lib/workspace-auth", () => ({
  ensureDefaultWorkspace: vi.fn().mockResolvedValue({ id: "ws-1" }),
}));
vi.mock("ai", () => ({ generateText: vi.fn().mockResolvedValue({ text: "[]" }) }));

import { POST } from "@/app/api/chat/route";

function chatReq(body: unknown, raw?: string) {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

const authed = { user: { id: "user-1", email: "u@x.com" } };

beforeEach(() => {
  vi.clearAllMocks();
  enforceAiBudget.mockResolvedValue({ ok: true });
  writeAuditLog.mockResolvedValue(undefined);
  getUserModelConfig.mockResolvedValue({ model: {}, modelName: "gemini-2.5-flash", provider: "gemini" });
});

describe("POST /api/chat — gate logic (real handler)", () => {
  it("returns 401 without a session and never consults the budget", async () => {
    getSession.mockResolvedValue(null);
    const res = await POST(chatReq({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(401);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("returns the budget response when the user is over quota", async () => {
    getSession.mockResolvedValue(authed);
    enforceAiBudget.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429 }),
    });
    const res = await POST(chatReq({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(429);
  });

  it("returns 400 for malformed JSON", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(chatReq(undefined, "{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty messages array (used to crash with 500)", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(chatReq({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the last message has no string content", async () => {
    getSession.mockResolvedValue(authed);
    const res = await POST(chatReq({ messages: [{ role: "user", content: 42 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when no server-managed AI provider is configured", async () => {
    getSession.mockResolvedValue(authed);
    getUserModelConfig.mockRejectedValue(new Error("No server-managed AI provider key is configured"));
    const res = await POST(chatReq({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("AI_PROVIDER_UNAVAILABLE");
  });
});
