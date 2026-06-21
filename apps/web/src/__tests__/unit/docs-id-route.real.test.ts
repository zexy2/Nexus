/**
 * Real route-handler tests for /api/docs/[id].
 *
 * Drives the actual GET/PATCH/DELETE handlers. Locks in: UUID validation (400),
 * the auth gate (401), the membership-aware authorization (404 when the doc is
 * not in an accessible workspace), and the happy paths. `findAuthorizedDoc`
 * joins workspaces + workspace_members, so these tests guard the membership-aware
 * authorization model used across the docs API.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));

const enforceMutationBudget = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  enforceMutationBudget: (...a: unknown[]) => enforceMutationBudget(...a),
}));

// db mock: select chain feeds `findAuthorizedDoc`; update chain serves PATCH
// (.returning()) and DELETE (awaited directly).
let selectResults: unknown[] = [];
let selectIndex = 0;
let updateReturning: unknown[] = [];
const updateWhere = vi.fn();

function selectChain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "limit", "orderBy"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(selectResults[selectIndex++] ?? []).then(res, rej);
  return b;
}

vi.mock("@/lib/db", () => ({
  db: {
    select: () => selectChain(),
    update: () => ({
      set: () => ({
        where: (...a: unknown[]) => {
          updateWhere(...a);
          const p: Promise<undefined> & { returning?: () => Promise<unknown[]> } =
            Promise.resolve(undefined);
          p.returning = () => Promise.resolve(updateReturning);
          return p;
        },
      }),
    }),
  },
}));

import { GET, PATCH, DELETE } from "@/app/api/docs/[id]/route";

const VALID_ID = "11111111-1111-1111-1111-111111111111";
// The route authenticates via verifySession(), which requires both a user and
// a session on the better-auth result.
const authed = {
  user: { id: "user-1", email: "u@x.com", name: "User" },
  session: { id: "s1", expiresAt: new Date(Date.now() + 1e6) },
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, body?: unknown) {
  return new Request(`http://localhost:3000/api/docs/${VALID_ID}`, {
    method,
    headers: { "content-type": "application/json", cookie: "session=abc" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const docRow = {
  id: VALID_ID,
  workspaceId: "ws-1",
  title: "Doc",
  iconEmoji: "📄",
  content: [],
  createdBy: "user-1",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = [];
  selectIndex = 0;
  updateReturning = [];
  enforceMutationBudget.mockResolvedValue(null);
  delete process.env.OPENAI_API_KEY; // keep background-embedding fetch off by default
});

describe("GET /api/docs/[id] (real handler)", () => {
  it("returns 400 for a non-UUID id", async () => {
    const res = await GET(req("GET"), params("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(req("GET"), params(VALID_ID));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the doc is not in an accessible workspace", async () => {
    getSession.mockResolvedValue(authed);
    selectResults = [[]]; // findAuthorizedDoc -> none
    const res = await GET(req("GET"), params(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("returns the doc when authorized", async () => {
    getSession.mockResolvedValue(authed);
    selectResults = [[{ doc: docRow }]];
    const res = await GET(req("GET"), params(VALID_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: VALID_ID, title: "Doc", workspaceId: "ws-1" });
  });
});

describe("PATCH /api/docs/[id] (real handler)", () => {
  it("returns 404 when not authorized to the doc", async () => {
    getSession.mockResolvedValue(authed);
    selectResults = [[]];
    const res = await PATCH(req("PATCH", { title: "New" }), params(VALID_ID));
    expect(res.status).toBe(404);
  });

  it("updates the doc and returns the new fields", async () => {
    getSession.mockResolvedValue(authed);
    selectResults = [[{ doc: docRow }]];
    updateReturning = [{ ...docRow, title: "New title", updatedAt: new Date("2026-02-02T00:00:00Z") }];
    const res = await PATCH(req("PATCH", { title: "New title" }), params(VALID_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "New title" });
  });
});

describe("DELETE /api/docs/[id] (real handler)", () => {
  it("returns 400 for invalid id", async () => {
    const res = await DELETE(req("DELETE"), params("bad"));
    expect(res.status).toBe(400);
  });

  it("soft-deletes (archives) an authorized doc", async () => {
    getSession.mockResolvedValue(authed);
    selectResults = [[{ doc: docRow }]];
    const res = await DELETE(req("DELETE"), params(VALID_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(updateWhere).toHaveBeenCalled(); // archive write happened
  });
});
