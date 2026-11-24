/**
 * Finding: "Internal error messages returned to clients".
 *
 * Unexpected errors (database, provider, workflow engine) are logged with a
 * request id; the client receives a generic message plus that id only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { sync: {} },
}));

const SECRET = 'relation "users" does not exist at postgres://admin:hunter2@db:5432';

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "leftJoin", "innerJoin", "where", "limit", "orderBy"]) chain[m] = () => chain;
  chain.then = (_res: unknown, rej: (e: unknown) => unknown) => Promise.reject(new Error(SECRET)).catch(rej);
  return { db: { select: () => chain } };
});

import { GET as syncPullGET } from "@/app/api/sync/pull/route";
import { getRequestId, internalError, isErrorCode } from "@/lib/api-response";

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  protectRoute.mockResolvedValue({ success: true, user: { id: "user-1", email: "u@x.com" } });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("Internal error messages returned to clients", () => {
  it("internalError logs details but returns only a generic message and request id", async () => {
    const res = internalError("Test", new Error(SECRET));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-request-id")).toBe(body.requestId);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(body.requestId), expect.any(Error));
  });

  it("reuses a well-formed inbound x-request-id and rejects malformed ones", () => {
    expect(getRequestId(new Headers({ "x-request-id": "abc12345-proxy" }))).toBe("abc12345-proxy");
    expect(getRequestId(new Headers({ "x-request-id": "<script>" }))).not.toBe("<script>");
  });

  it("only machine-readable codes are treated as safe to echo", () => {
    expect(isErrorCode("invalid_state")).toBe(true);
    expect(isErrorCode("ACTIVE_AGENT_JOB_EXISTS")).toBe(true);
    expect(isErrorCode(SECRET)).toBe(false);
  });

  it("GET /api/sync/pull does not leak a database error", async () => {
    const res = await syncPullGET(new NextRequest("http://localhost:3000/api/sync/pull"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("relation");
    expect(JSON.parse(text).requestId).toBeTruthy();
  });
});
