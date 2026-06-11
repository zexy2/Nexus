/**
 * Real unit tests for the semantic-search helper (lib/ai/embeddings).
 *
 * Covers: availability gating, the workspace-scoped pgvector query path
 * (OpenAI embed -> db.execute -> mapped hits, filtered by minSimilarity), and
 * context building with doc-title resolution. The OpenAI call and DB are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const dbExecute = vi.fn();
const selectWhere = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...a: unknown[]) => dbExecute(...a),
    select: () => ({ from: () => ({ where: (...a: unknown[]) => selectWhere(...a) }) }),
  },
}));

import { isEmbeddingsAvailable, semanticSearch, buildSemanticContext } from "@/lib/ai/embeddings";

const ORIGINAL_FETCH = global.fetch;

function mockOpenAIEmbedding() {
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ data: [{ embedding: Array(1536).fill(0.01) }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ) as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test";
});

describe("isEmbeddingsAvailable", () => {
  it("reflects the OPENAI_API_KEY presence", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(isEmbeddingsAvailable()).toBe(true);
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingsAvailable()).toBe(false);
  });
});

describe("semanticSearch (real)", () => {
  it("returns [] when embeddings are not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const hits = await semanticSearch("q", "ws-1");
    expect(hits).toEqual([]);
    expect(dbExecute).not.toHaveBeenCalled();
  });

  it("returns [] for empty query or workspace", async () => {
    expect(await semanticSearch("   ", "ws-1")).toEqual([]);
    expect(await semanticSearch("q", "")).toEqual([]);
  });

  it("embeds the query and maps workspace-scoped vector hits", async () => {
    mockOpenAIEmbedding();
    dbExecute.mockResolvedValue([
      { doc_id: "d1", content: "alpha chunk", similarity: 0.91 },
      { doc_id: "d2", content: "beta chunk", similarity: 0.55 },
    ]);

    const hits = await semanticSearch("roadmap", "ws-1", { limit: 5 });
    expect(global.fetch).toHaveBeenCalledOnce();
    expect(dbExecute).toHaveBeenCalledOnce();
    expect(hits).toEqual([
      { docId: "d1", content: "alpha chunk", similarity: 0.91 },
      { docId: "d2", content: "beta chunk", similarity: 0.55 },
    ]);
  });

  it("filters out hits below minSimilarity", async () => {
    mockOpenAIEmbedding();
    dbExecute.mockResolvedValue([
      { doc_id: "d1", content: "a", similarity: 0.8 },
      { doc_id: "d2", content: "b", similarity: 0.1 },
    ]);
    const hits = await semanticSearch("q", "ws-1", { minSimilarity: 0.5 });
    expect(hits.map((h) => h.docId)).toEqual(["d1"]);
  });
});

describe("buildSemanticContext (real)", () => {
  it("returns empty string for no hits", async () => {
    expect(await buildSemanticContext([])).toBe("");
    expect(selectWhere).not.toHaveBeenCalled();
  });

  it("resolves doc titles and renders the context block", async () => {
    selectWhere.mockResolvedValue([
      { id: "d1", title: "Quarterly Roadmap" },
    ]);
    const ctx = await buildSemanticContext([
      { docId: "d1", content: "the plan for Q3", similarity: 0.92 },
    ]);
    expect(ctx).toContain("Quarterly Roadmap");
    expect(ctx).toContain("92%");
    expect(ctx).toContain("the plan for Q3");
  });
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});
