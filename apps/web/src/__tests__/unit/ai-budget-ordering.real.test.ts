/**
 * Finding: "AI budget charged before request validation/authorization".
 *
 * The persistent AI budget (global 25/day by default) is a shared resource; a
 * malformed or unauthorized request must not burn it. Each AI route is driven
 * with an invalid body and/or a forbidden workspace and must reject the
 * request without calling enforceAiBudget.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceAiBudget = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
  writeAuditLog: vi.fn(async () => undefined),
  aiUnavailableResponse: (message: string) => Response.json({ error: "AI_PROVIDER_UNAVAILABLE", message }, { status: 503 }),
  getAiProviderStatus: () => ({ geminiAvailable: true }),
}));

vi.mock("@/lib/api-middleware", () => ({
  RATE_LIMITS: {},
  protectRoute: vi.fn(async () => ({ success: true, user: { id: "user-1", email: "u@x.com" } })),
}));

const requireWorkspaceAccess = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
}));

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "where", "orderBy", "limit"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve([]).then(resolve);
  return {
    db: {
      ...chain,
      query: {
        docs: { findFirst: vi.fn(async () => undefined) },
        vectors: { findFirst: vi.fn(async () => undefined) },
      },
    },
  };
});

vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/tavily", () => ({ searchWeb: vi.fn() }));
vi.mock("@/lib/ai/chat-rag", () => ({ getRAGContext: vi.fn() }));
vi.mock("@/lib/ai/model-config", () => ({ getUserModelConfig: vi.fn() }));
vi.mock("@/lib/ai/agent", () => ({ runAgent: vi.fn() }));

import { POST as researchPOST } from "@/app/api/research/route";
import { POST as deepResearchPOST } from "@/app/api/research/deep/route";
import { POST as commandPOST } from "@/app/api/commands/process/route";
import { POST as embeddingsPOST } from "@/app/api/embeddings/route";

function req(path: string, body: unknown, raw?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

const forbidden = { ok: false, status: 403, error: "Workspace access denied" };

beforeEach(() => {
  vi.clearAllMocks();
  enforceAiBudget.mockResolvedValue({ ok: true });
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1", role: "member" });
  process.env.TAVILY_API_KEY = "test";
  process.env.GEMINI_API_KEY = "test";
  process.env.OPENAI_API_KEY = "test";
});

describe("AI budget charged before request validation/authorization", () => {
  it("/api/research: forbidden workspace does not consume budget", async () => {
    requireWorkspaceAccess.mockResolvedValue(forbidden);
    const res = await researchPOST(req("/api/research", { query: "q", workspaceId: "victim" }));
    expect(res.status).toBe(403);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("/api/research/deep: missing or malformed query does not consume budget", async () => {
    expect((await deepResearchPOST(req("/api/research/deep", {}))).status).toBe(400);
    expect((await deepResearchPOST(req("/api/research/deep", undefined, "{nope"))).status).toBe(400);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("/api/commands/process: invalid body and forbidden workspace do not consume budget", async () => {
    expect((await commandPOST(req("/api/commands/process", { command: "x" }))).status).toBe(400);
    requireWorkspaceAccess.mockResolvedValue(forbidden);
    const res = await commandPOST(
      req("/api/commands/process", { commandId: "c-1", command: "do it", workspaceId: "victim" })
    );
    expect(res.status).toBe(403);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });

  it("/api/embeddings: unknown document does not consume budget", async () => {
    const res = await embeddingsPOST(req("/api/embeddings", { docId: "missing", workspaceId: "ws-1" }));
    expect(res.status).toBe(404);
    expect(enforceAiBudget).not.toHaveBeenCalled();
  });
});
