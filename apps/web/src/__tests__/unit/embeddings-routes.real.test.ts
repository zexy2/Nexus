/**
 * Real route-handler tests for /api/embeddings/search (POST = semantic search,
 * PUT = index a document).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { embeddings: {} },
}));

const dbExecute = vi.fn();
const docsFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...a: unknown[]) => dbExecute(...a),
    query: { docs: { findFirst: (...a: unknown[]) => docsFindFirst(...a) } },
  },
}));

const requireWorkspaceAccess = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
}));

const enforceAiBudget = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
  aiUnavailableResponse: (message: string) =>
    Response.json({ error: "AI_PROVIDER_UNAVAILABLE", message }, { status: 503 }),
}));

vi.mock("@/lib/api-response", () => ({
  internalError: () => Response.json({ error: "Internal Server Error" }, { status: 500 }),
}));

import { NextRequest } from "next/server";
import { POST, PUT } from "@/app/api/embeddings/search/route";

const user = { id: "user-1", email: "u@x.com" };
const jsonReq = (method: string, body: unknown) =>
  new NextRequest("http://localhost:3000/api/embeddings/search", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const fetchMock = vi.fn();
const originalFetch = global.fetch;
const longChunk = "A".repeat(60);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.OPENAI_API_KEY = "sk-test";
  protectRoute.mockResolvedValue({ success: true, user });
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  enforceAiBudget.mockResolvedValue({ ok: true });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

function embeddingsResponse(n: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: Array.from({ length: n }, (_, i) => ({ embedding: [i, 0.5], index: i })) }),
  };
}

describe.each([
  ["POST", POST, { query: "q", workspaceId: "ws-1" }],
  ["PUT", PUT, { docId: "d1", content: longChunk, workspaceId: "ws-1" }],
] as const)("%s /api/embeddings/search common gates", (_name, handler, validBody) => {
  it("returns the protection response when unauthenticated", async () => {
    protectRoute.mockResolvedValue({
      success: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await handler(jsonReq("POST", validBody))).status).toBe(401);
  });

  it("returns 503 when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const res = await handler(jsonReq("POST", validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  it("forwards workspace access failures", async () => {
    requireWorkspaceAccess.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    docsFindFirst.mockResolvedValue({ id: "d1" });
    expect((await handler(jsonReq("POST", validBody))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/embeddings/search", () => {
  it("returns 400 when the query is missing", async () => {
    const res = await POST(jsonReq("POST", { workspaceId: "ws-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when workspaceId is missing", async () => {
    const res = await POST(jsonReq("POST", { query: "q" }));
    expect(res.status).toBe(400);
  });

  it("returns the budget response when the AI budget is exhausted", async () => {
    enforceAiBudget.mockResolvedValue({ ok: false, response: Response.json({ error: "budget" }, { status: 429 }) });
    expect((await POST(jsonReq("POST", { query: "q", workspaceId: "ws-1" }))).status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("embeds the query and maps vector rows", async () => {
    fetchMock.mockResolvedValue(embeddingsResponse(1));
    dbExecute.mockResolvedValue([
      { id: "v1", doc_id: "d1", content: "hello", metadata: { position: 0 }, similarity: 0.9 },
    ]);
    const res = await POST(jsonReq("POST", { query: "hello", workspaceId: "ws-1", limit: 500 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      query: "hello",
      results: [{ id: "v1", docId: "d1", content: "hello", metadata: { position: 0 }, similarity: 0.9 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/embeddings",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns 500 when the OpenAI call fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const res = await POST(jsonReq("POST", { query: "q", workspaceId: "ws-1" }));
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/embeddings/search", () => {
  const put = (body: unknown) => PUT(jsonReq("PUT", body));

  it("returns 400 when required fields are missing", async () => {
    expect((await put({ docId: "d1", workspaceId: "ws-1" })).status).toBe(400);
  });

  it("returns 400 when workspaceId is not a string", async () => {
    expect((await put({ docId: "d1", content: longChunk, workspaceId: 5 })).status).toBe(400);
  });

  it("returns 404 when the document is not in the workspace", async () => {
    docsFindFirst.mockResolvedValue(undefined);
    const res = await put({ docId: "d1", content: longChunk, workspaceId: "ws-1" });
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the budget response when the AI budget is exhausted", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1" });
    enforceAiBudget.mockResolvedValue({ ok: false, response: Response.json({ error: "budget" }, { status: 429 }) });
    expect((await put({ docId: "d1", content: longChunk, workspaceId: "ws-1" })).status).toBe(429);
  });

  it("indexes nothing when no chunk is long enough", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1" });
    const res = await put({ docId: "d1", content: "too short", workspaceId: "ws-1" });
    expect(await res.json()).toMatchObject({ success: true, chunksCreated: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replaces existing vectors and inserts one row per chunk", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1" });
    fetchMock.mockResolvedValue(embeddingsResponse(2));
    dbExecute.mockResolvedValue([]);
    const content = `${longChunk}\n\n${"B".repeat(60)}\n\nshort`;
    const res = await put({ docId: "d1", content, workspaceId: "ws-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, docId: "d1", chunksCreated: 2 });
    // 1 delete + 2 inserts
    expect(dbExecute).toHaveBeenCalledTimes(3);
  });

  it("returns 500 when the embedding provider fails", async () => {
    docsFindFirst.mockResolvedValue({ id: "d1" });
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    const res = await put({ docId: "d1", content: longChunk, workspaceId: "ws-1" });
    expect(res.status).toBe(500);
    expect(dbExecute).not.toHaveBeenCalled();
  });
});
