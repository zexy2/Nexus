/**
 * Findings:
 *  - "Embeddings search loads all vectors into memory": GET /api/embeddings
 *    must rank in Postgres (pgvector `<=>` + LIMIT) and never load the whole
 *    workspace's vectors.
 *  - "change-sets list N+1": GET /api/change-sets must issue one query
 *    regardless of how many change sets are returned.
 */
import { NextRequest } from "next/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dialect = new PgDialect();
const executed: Array<{ sql: string; params: unknown[] }> = [];
const selectCalls: string[] = [];
const findMany = vi.fn();
let executeRows: unknown[] = [];
let selectRows: unknown[] = [];

vi.mock("@/lib/db", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
      chain[method] = () => chain;
    }
    chain.as = () => new Proxy({}, { get: (_t, prop) => ({ fieldAlias: String(prop) }) });
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(selectRows).then(resolve);
    return chain;
  };
  return {
    db: {
      execute: vi.fn(async (query: SQL) => {
        executed.push(dialect.sqlToQuery(query));
        return executeRows;
      }),
      select: vi.fn(() => {
        selectCalls.push("select");
        return makeChain();
      }),
      query: { vectors: { findMany: (...a: unknown[]) => findMany(...a) } },
    },
  };
});

vi.mock("@/lib/api-middleware", () => ({
  RATE_LIMITS: {},
  protectRoute: vi.fn(async () => ({ success: true, user: { id: "user-1", email: "u@x.com" } })),
  verifySession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ ok: true, workspaceId: "ws-1", role: "member" })),
  getAccessibleWorkspaceIds: vi.fn(async () => ["ws-1"]),
}));
const enforceAiBudget = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: (...a: unknown[]) => enforceAiBudget(...a),
  aiUnavailableResponse: () => Response.json({}, { status: 503 }),
}));

import { GET as embeddingsGET } from "@/app/api/embeddings/route";
import { GET as changeSetsGET } from "@/app/api/change-sets/route";

beforeEach(() => {
  vi.clearAllMocks();
  executed.length = 0;
  selectCalls.length = 0;
  executeRows = [];
  selectRows = [];
  enforceAiBudget.mockResolvedValue({ ok: true });
  process.env.OPENAI_API_KEY = "test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] }))
  );
});

describe("Embeddings search loads all vectors into memory", () => {
  it("ranks with pgvector in SQL, applies LIMIT and the threshold, and batches doc lookup", async () => {
    executeRows = [
      { id: "v1", source_id: "d1", content: "a", metadata: null, similarity: "0.9" },
      { id: "v2", source_id: "d2", content: "b", metadata: null, similarity: "0.1" },
    ];
    selectRows = [{ id: "d1", title: "Doc 1" }];

    const res = await embeddingsGET(
      new NextRequest("http://localhost:3000/api/embeddings?q=hello&workspaceId=ws-1&limit=7&threshold=0.5")
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(findMany).not.toHaveBeenCalled();
    expect(executed).toHaveLength(1);
    expect(executed[0]!.sql).toMatch(/ORDER BY embedding <=> .*::vector/);
    expect(executed[0]!.sql).toMatch(/LIMIT \$\d+/);
    expect(executed[0]!.params).toContain(7);
    expect(executed[0]!.params).toContain("ws-1");

    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ id: "v1", sourceId: "d1", similarity: 0.9, document: { id: "d1" } });
    // one select for all associated documents
    expect(selectCalls).toHaveLength(1);
    expect(enforceAiBudget).toHaveBeenCalledWith(expect.objectContaining({ kind: "embedding" }));
  });

  it("caps an oversized limit", async () => {
    await embeddingsGET(new NextRequest("http://localhost:3000/api/embeddings?q=x&workspaceId=ws-1&limit=100000"));
    expect(executed[0]!.params).toContain(50);
  });
});

describe("change-sets list N+1", () => {
  it("returns proposal counts from a single query", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    selectRows = Array.from({ length: 5 }, (_, i) => ({
      changeSet: {
        id: `cs-${i}`,
        docId: "d1",
        status: "pending",
        summary: null,
        stats: null,
        temporalWorkflowId: null,
        createdAt,
        resolvedAt: null,
      },
      docTitle: "Doc",
      total: 3,
      pending: 1,
      applied: 2,
      rejected: 0,
    }));
    selectRows.push({ ...(selectRows[0] as object), total: null, pending: null, applied: null, rejected: null });

    const res = await changeSetsGET(new NextRequest("http://localhost:3000/api/change-sets"));
    const body = await res.json();

    expect(selectCalls.length).toBeLessThanOrEqual(2); // outer query + grouped subquery builder
    expect(body).toHaveLength(6);
    expect(body[0].proposals).toEqual({ total: 3, pending: 1, applied: 2, rejected: 0 });
    expect(body[5].proposals).toEqual({ total: 0, pending: 0, applied: 0, rejected: 0 });
  });
});
