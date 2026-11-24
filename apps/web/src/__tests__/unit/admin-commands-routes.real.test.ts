/**
 * Real route-handler tests for GET /api/admin/usage and GET /api/commands/status
 * (the latter re-exports the status handler of /api/commands/process).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { chain } from "../helpers/chain";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...a: unknown[]) => getSession(...a) } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const dbSelect = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { select: (...a: unknown[]) => dbSelect(...a) },
}));

const isAdminEmail = vi.fn();
const getAuditUsageSummary = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  isAdminEmail: (...a: unknown[]) => isAdminEmail(...a),
  getAuditUsageSummary: (...a: unknown[]) => getAuditUsageSummary(...a),
  enforceAiBudget: vi.fn(),
  writeAuditLog: vi.fn(),
}));

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => protectRoute(...a),
  RATE_LIMITS: { commands: {} },
}));

vi.mock("@/lib/workspace-auth", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/lib/ai/model-config", () => ({ getUserModelConfig: vi.fn() }));
vi.mock("@/lib/ai/agent", () => ({ runAgent: vi.fn() }));

const expireStaleCommandExecution = vi.fn();
vi.mock("@/lib/command-lease", () => ({
  COMMAND_WORKFLOW_ID_PREFIX: "cmd-",
  expireStaleCommandExecution: (...a: unknown[]) => expireStaleCommandExecution(...a),
  startCommandHeartbeat: vi.fn(() => () => {}),
}));

import { NextRequest } from "next/server";
import { GET as usageGET } from "@/app/api/admin/usage/route";
import { GET as statusGET } from "@/app/api/commands/status/route";

const req = (url: string) => new NextRequest(`http://localhost:3000${url}`);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/admin/usage", () => {
  it("returns 401 without a session", async () => {
    getSession.mockResolvedValue(null);
    expect((await usageGET()).status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "u@x.com", emailVerified: true } });
    isAdminEmail.mockReturnValue(false);
    const res = await usageGET();
    expect(res.status).toBe(403);
    expect(getAuditUsageSummary).not.toHaveBeenCalled();
  });

  it("returns the usage summary for admins", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", email: "a@x.com", emailVerified: true } });
    isAdminEmail.mockReturnValue(true);
    getAuditUsageSummary.mockResolvedValue({ aiCallsToday: 7 });
    dbSelect
      .mockReturnValueOnce(chain([{ count: 3 }])) // failed workflows
      .mockReturnValueOnce(chain([{ key: "k", bucket: "chat", count: 1, limit: 5 }])) // buckets
      .mockReturnValueOnce(chain([{ id: "a1" }])) // audit events
      .mockReturnValueOnce(chain([{ id: "w1" }, { id: "w2" }])); // stale external writes
    const res = await usageGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(isAdminEmail).toHaveBeenCalledWith("a@x.com", true);
    expect(body).toMatchObject({
      aiCallsToday: 7,
      failedWorkflows24h: 3,
      activeBuckets: [{ key: "k" }],
      recentAuditEvents: [{ id: "a1" }],
      externalWrites: { staleAfterMinutes: 5, staleCount: 2 },
    });
  });
});

describe("GET /api/commands/status", () => {
  const user = { id: "u1", email: "u@x.com" };

  it("returns the protection response when auth/rate limit fails", async () => {
    const response = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    protectRoute.mockResolvedValue({ success: false, response });
    expect((await statusGET(req("/api/commands/status?id=c1"))).status).toBe(401);
  });

  it("returns 401 when protection succeeds without a user", async () => {
    protectRoute.mockResolvedValue({ success: true });
    expect((await statusGET(req("/api/commands/status?id=c1"))).status).toBe(401);
  });

  it("returns 400 when the id parameter is missing", async () => {
    protectRoute.mockResolvedValue({ success: true, user });
    const res = await statusGET(req("/api/commands/status"));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown command", async () => {
    protectRoute.mockResolvedValue({ success: true, user });
    dbSelect.mockReturnValue(chain([]));
    expect((await statusGET(req("/api/commands/status?id=c1"))).status).toBe(404);
  });

  it("maps a completed execution to the wire format", async () => {
    protectRoute.mockResolvedValue({ success: true, user });
    const execution = {
      id: "ex1", status: "completed", output: { output: "done" }, errorMessage: null,
      startedAt: new Date(5000), createdAt: new Date(1000),
    };
    dbSelect.mockReturnValue(chain([execution]));
    expireStaleCommandExecution.mockResolvedValue(execution);
    const res = await statusGET(req("/api/commands/status?id=c1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "completed",
      result: { output: "done" },
      startedAt: 5000,
      executionId: "ex1",
    });
  });

  it("reports running executions as processing and failures with their error", async () => {
    protectRoute.mockResolvedValue({ success: true, user });
    const running = { id: "ex1", status: "running", output: null, errorMessage: null, startedAt: null, createdAt: new Date(1000) };
    dbSelect.mockReturnValue(chain([running]));
    expireStaleCommandExecution.mockResolvedValue(running);
    const body = await (await statusGET(req("/api/commands/status?id=c1"))).json();
    expect(body.status).toBe("processing");
    expect(body.startedAt).toBe(1000);

    const failed = { ...running, status: "failed", errorMessage: "boom" };
    dbSelect.mockReturnValue(chain([failed]));
    expireStaleCommandExecution.mockResolvedValue(failed);
    const failedBody = await (await statusGET(req("/api/commands/status?id=c1"))).json();
    expect(failedBody).toMatchObject({ status: "failed", error: "boom" });
  });

  it("returns 500 when the lookup throws", async () => {
    protectRoute.mockResolvedValue({ success: true, user });
    dbSelect.mockImplementation(() => {
      throw new Error("db down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await statusGET(req("/api/commands/status?id=c1"));
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});
