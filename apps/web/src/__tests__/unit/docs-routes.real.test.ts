/**
 * Real route-handler tests for /api/docs (GET, POST) and /api/docs/archived (GET).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "../helpers/chain";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const docsFindMany = vi.fn();
const usersFindMany = vi.fn();
const dbInsert = vi.fn();
const dbSelect = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      docs: { findMany: (...a: unknown[]) => docsFindMany(...a) },
      users: { findMany: (...a: unknown[]) => usersFindMany(...a) },
    },
    insert: (...a: unknown[]) => dbInsert(...a),
    select: (...a: unknown[]) => dbSelect(...a),
  },
}));

const getAccessibleWorkspaceIds = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  getAccessibleWorkspaceIds: (...a: unknown[]) => getAccessibleWorkspaceIds(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const enforceMutationBudget = vi.fn();
const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceMutationBudget: (...a: unknown[]) => enforceMutationBudget(...a),
  writeAuditLog: (...a: unknown[]) => writeAuditLog(...a),
}));

import { GET, POST } from "@/app/api/docs/route";
import { GET as archivedGET } from "@/app/api/docs/archived/route";

const authed = { user: { id: "user-1", email: "u@x.com", name: "U" } };
const updatedAt = new Date("2026-02-01T00:00:00Z");
const post = (body: unknown) =>
  new Request("http://localhost:3000/api/docs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  verifySession.mockResolvedValue(authed);
  enforceMutationBudget.mockResolvedValue(null);
  ensureDefaultWorkspace.mockResolvedValue({ id: "ws-1" });
});

describe("GET /api/docs", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns [] when the user has no accessible workspace", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue([]);
    const res = await GET();
    expect(await res.json()).toEqual([]);
    expect(docsFindMany).not.toHaveBeenCalled();
  });

  it("lists documents in the response shape with the creator's display name", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1"]);
    docsFindMany.mockResolvedValue([
      { id: "d1", title: "A", iconEmoji: "x", updatedAt, createdBy: "user-1", isAiGenerated: 1, isFavorite: 0 },
      { id: "d2", title: "B", iconEmoji: null, updatedAt, createdBy: null, isAiGenerated: 0, isFavorite: 1 },
    ]);
    usersFindMany.mockResolvedValue([{ id: "user-1", name: "Ada", email: "ada@x.com" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "d1", title: "A", iconEmoji: "x", updatedAt: updatedAt.toISOString(),
        createdBy: "user-1", createdByName: "Ada", isAiGenerated: true, isFavorite: false,
      },
      {
        id: "d2", title: "B", iconEmoji: null, updatedAt: updatedAt.toISOString(),
        createdBy: null, createdByName: null, isAiGenerated: false, isFavorite: true,
      },
    ]);
    expect(usersFindMany).toHaveBeenCalledTimes(1);
  });

  it("returns 500 (not a fake empty list) on a database error", async () => {
    getAccessibleWorkspaceIds.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/docs", () => {
  function mockInsert(captured?: (v: unknown) => void) {
    dbInsert.mockReturnValue({
      values: (v: unknown) => {
        captured?.(v);
        return chain([{ id: "d1", title: (v as { title: string }).title, iconEmoji: "📄", updatedAt, createdBy: "user-1", isAiGenerated: 0 }]);
      },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await POST(post({}))).status).toBe(401);
  });

  it("returns the mutation-budget response when the budget is exhausted", async () => {
    enforceMutationBudget.mockResolvedValue(Response.json({ error: "Too many" }, { status: 429 }));
    expect((await POST(post({ title: "x" }))).status).toBe(429);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the title is too long", async () => {
    const res = await POST(post({ title: "x".repeat(501) }));
    expect(res.status).toBe(400);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("creates a document with defaults and audits it", async () => {
    let values: Record<string, unknown> = {};
    mockInsert((v) => (values = v as Record<string, unknown>));
    const res = await POST(post({}));
    expect(res.status).toBe(200);
    expect(values).toMatchObject({ workspaceId: "ws-1", title: "Untitled", content: [], createdBy: "user-1" });
    expect((await res.json()).id).toBe("d1");
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "document.create", workspaceId: "ws-1" })
    );
  });

  it("converts string content to a paragraph block", async () => {
    let values: { content?: Array<{ type: string; content: Array<{ text: string }> }> } = {};
    mockInsert((v) => (values = v as typeof values));
    await POST(post({ title: "T", content: "hello world" }));
    expect(values.content?.[0]?.type).toBe("paragraph");
    expect(values.content?.[0]?.content[0]?.text).toBe("hello world");
  });

  it("returns 500 when the insert fails", async () => {
    dbInsert.mockImplementation(() => {
      throw new Error("db down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post({ title: "T" }));
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});

describe("GET /api/docs/archived", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await archivedGET()).status).toBe(401);
  });

  it("returns [] when the user has no accessible workspace", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue([]);
    const res = await archivedGET();
    expect(await res.json()).toEqual([]);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("lists archived documents across accessible workspaces with the owner-only delete flag", async () => {
    getAccessibleWorkspaceIds.mockResolvedValue(["ws-1", "ws-2"]);
    dbSelect.mockReturnValue(
      chain([
        { doc: { id: "d9", title: "Old", iconEmoji: "x", updatedAt, createdBy: "user-1" }, workspaceOwnerId: "user-1" },
        { doc: { id: "d8", title: "Shared", iconEmoji: null, updatedAt, createdBy: "user-2" }, workspaceOwnerId: "user-2" },
      ])
    );
    const res = await archivedGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "d9", title: "Old", iconEmoji: "x", updatedAt: updatedAt.toISOString(), createdBy: "user-1", canDeletePermanently: true },
      { id: "d8", title: "Shared", iconEmoji: null, updatedAt: updatedAt.toISOString(), createdBy: "user-2", canDeletePermanently: false },
    ]);
  });

  it("returns 500 (not a fake empty archive) on a database error", async () => {
    getAccessibleWorkspaceIds.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await archivedGET();
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});
