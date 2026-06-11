/**
 * Real route-handler tests for GET /api/collab/token.
 *
 * This endpoint is the authorization gate for realtime collaboration: it must
 * reject unauthenticated callers, invalid doc ids, and users without access to
 * the document, and only issue a token for an accessible document.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

let selectResult: unknown[] = [];
function selectChain() {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "limit"]) b[m] = () => b;
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(selectResult).then(res, rej);
  return b;
}
vi.mock("@/lib/db", () => ({ db: { select: () => selectChain() } }));

import { GET } from "@/app/api/collab/token/route";
import { verifyCollabToken } from "@/lib/collab-token";

const VALID_DOC = "11111111-1111-1111-1111-111111111111";
const authed = { user: { id: "user-1", email: "u@x.com" } };

function tokenReq(docId?: string) {
  const url = docId
    ? `http://localhost:3000/api/collab/token?docId=${docId}`
    : "http://localhost:3000/api/collab/token";
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResult = [];
  process.env.COLLAB_AUTH_SECRET = "test-collab-secret";
});

describe("GET /api/collab/token (real handler)", () => {
  it("returns 401 without a session", async () => {
    verifySession.mockResolvedValue(null);
    const res = await GET(tokenReq(VALID_DOC));
    expect(res.status).toBe(401);
  });

  it("returns 400 for a missing or non-UUID docId", async () => {
    verifySession.mockResolvedValue(authed);
    expect((await GET(tokenReq())).status).toBe(400);
    expect((await GET(tokenReq("not-a-uuid"))).status).toBe(400);
  });

  it("returns 500 when COLLAB_AUTH_SECRET is not configured", async () => {
    verifySession.mockResolvedValue(authed);
    delete process.env.COLLAB_AUTH_SECRET;
    const res = await GET(tokenReq(VALID_DOC));
    expect(res.status).toBe(500);
  });

  it("returns 403 when the user cannot access the document", async () => {
    verifySession.mockResolvedValue(authed);
    selectResult = []; // membership-aware query finds nothing
    const res = await GET(tokenReq(VALID_DOC));
    expect(res.status).toBe(403);
  });

  it("issues a verifiable, document-scoped token for an accessible doc", async () => {
    verifySession.mockResolvedValue(authed);
    selectResult = [{ id: VALID_DOC }]; // user has access
    const res = await GET(tokenReq(VALID_DOC));
    expect(res.status).toBe(200);
    const { token } = await res.json();
    const payload = verifyCollabToken(token, "test-collab-secret");
    expect(payload).not.toBeNull();
    expect(payload!.d).toBe(VALID_DOC);
    expect(payload!.u).toBe("user-1");
  });
});
