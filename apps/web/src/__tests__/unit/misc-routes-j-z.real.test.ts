/**
 * Route tests for small endpoints: onboarding/bootstrap, settings/verify-api-key,
 * traces, workflows/[id].
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  protect: vi.fn(),
  ensureWs: vi.fn(),
  getSession: vi.fn(),
  existingDoc: undefined as unknown,
  existingTask: undefined as unknown,
  inserted: [] as Array<{ table: unknown; values: unknown }>,
  getWorkflow: vi.fn(),
  traces: [] as unknown[],
}));

vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...a: unknown[]) => h.protect(...a),
  RATE_LIMITS: { default: {} },
}));
vi.mock("@/lib/workspace-auth", () => ({ ensureDefaultWorkspace: (...a: unknown[]) => h.ensureWs(...a) }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      docs: { findFirst: async () => h.existingDoc },
      tasks: { findFirst: async () => h.existingTask },
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        h.inserted.push({ table, values });
        return { returning: async () => [{ id: `new-${h.inserted.length}` }] };
      },
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: (...a: unknown[]) => h.getSession(...a) } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/observability", () => ({
  getAllTraces: () => h.traces,
  getTrace: (id: string) => (h.traces as Array<{ id: string }>).find((t) => t.id === id),
}));
vi.mock("@/app/api/workflows/route", () => ({ GET: (...a: unknown[]) => h.getWorkflow(...a) }));

import { NextRequest, NextResponse } from "next/server";
import { POST as bootstrap } from "@/app/api/onboarding/bootstrap/route";
import { POST as verifyApiKey } from "@/app/api/settings/verify-api-key/route";
import { GET as getTraces } from "@/app/api/traces/route";
import { GET as getWorkflowById } from "@/app/api/workflows/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.inserted = [];
  h.existingDoc = undefined;
  h.existingTask = undefined;
  h.traces = [];
  h.protect.mockResolvedValue({ success: true, user: { id: "user-1", email: "u@x.com", name: "U" } });
  h.ensureWs.mockResolvedValue({ id: "ws-1", name: "My Workspace" });
});

const bootReq = (body?: unknown) =>
  new NextRequest("http://localhost/api/onboarding/bootstrap", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("POST /api/onboarding/bootstrap", () => {
  it("returns the protection response when unauthenticated", async () => {
    h.protect.mockResolvedValue({
      success: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await bootstrap(bootReq({}))).status).toBe(401);
    expect(h.ensureWs).not.toHaveBeenCalled();
  });

  it("creates the starter doc and task for a new workspace", async () => {
    const res = await bootstrap(bootReq({ workspaceName: "  Acme  " }));
    expect(res.status).toBe(200);
    expect(h.ensureWs).toHaveBeenCalledWith("user-1", "Acme");
    expect(await res.json()).toMatchObject({
      workspace: { id: "ws-1" },
      starterDocId: "new-1",
      starterTaskIds: ["new-2"],
      nextAction: "generate_ai_document",
    });
    expect(h.inserted).toHaveLength(2);
  });

  it("is idempotent: reuses existing starter data", async () => {
    h.existingDoc = { id: "doc-x" };
    h.existingTask = { id: "task-x" };
    const body = await (await bootstrap(bootReq({}))).json();
    expect(body).toMatchObject({ starterDocId: "doc-x", starterTaskIds: ["task-x"] });
    expect(h.inserted).toHaveLength(0);
    expect(h.ensureWs).toHaveBeenCalledWith("user-1", "My Workspace");
  });

  it("skips starter data when includeStarterData is false (and tolerates no body)", async () => {
    const res = await bootstrap(bootReq({ includeStarterData: false }));
    expect(await res.json()).toMatchObject({ starterDocId: null, starterTaskIds: [] });
    expect(h.inserted).toHaveLength(0);
    expect((await bootstrap(bootReq())).status).toBe(200);
  });

  it("returns 500 when workspace creation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.ensureWs.mockRejectedValue(new Error("db down"));
    expect((await bootstrap(bootReq({}))).status).toBe(500);
  });
});

describe("POST /api/settings/verify-api-key", () => {
  it("always rejects with BYOK_DISABLED (403)", async () => {
    const res = await verifyApiKey();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "BYOK_DISABLED" });
  });
});

describe("GET /api/traces", () => {
  const adminSession = { user: { id: "a", email: "admin@x.com", emailVerified: true } };
  const req = (qs = "") => new NextRequest(`http://localhost/api/traces${qs}`);
  const trace = (id: string, status: string, tokens = 10) => ({ id, status, tokens });

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@x.com";
    h.getSession.mockResolvedValue(adminSession);
  });

  it("401 without a session", async () => {
    h.getSession.mockResolvedValue(null);
    expect((await getTraces(req())).status).toBe(401);
  });

  it("403 for non-admin and for unverified admin email", async () => {
    h.getSession.mockResolvedValue({ user: { id: "u", email: "other@x.com", emailVerified: true } });
    expect((await getTraces(req())).status).toBe(403);
    h.getSession.mockResolvedValue({ user: { id: "a", email: "admin@x.com", emailVerified: false } });
    expect((await getTraces(req())).status).toBe(403);
  });

  it("lists traces with a summary and honors limit", async () => {
    h.traces = [trace("t1", "completed", 5), trace("t2", "failed", 7), trace("t3", "running", 1)];
    const body = await (await getTraces(req("?limit=2"))).json();
    expect(body.total).toBe(2);
    expect(body.summary).toEqual({ completed: 1, failed: 1, running: 0, totalTokens: 12 });
  });

  it("returns a single trace or 404", async () => {
    h.traces = [trace("t1", "completed")];
    expect((await (await getTraces(req("?traceId=t1"))).json()).id).toBe("t1");
    expect((await getTraces(req("?traceId=nope"))).status).toBe(404);
  });
});

describe("GET /api/workflows/[id]", () => {
  it("delegates to the workflows GET handler with workflowId set", async () => {
    h.getWorkflow.mockResolvedValue(NextResponse.json({ status: "running" }));
    const res = await getWorkflowById(
      new NextRequest("http://localhost/api/workflows/wf-7", { headers: { cookie: "s=1" } }),
      { params: Promise.resolve({ id: "wf-7" }) }
    );
    expect(res.status).toBe(200);
    const forwarded = h.getWorkflow.mock.calls[0]![0] as NextRequest;
    expect(new URL(forwarded.url).searchParams.get("workflowId")).toBe("wf-7");
    expect(forwarded.headers.get("cookie")).toBe("s=1");
  });

  it("passes through an unauthenticated response from the delegate", async () => {
    h.getWorkflow.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await getWorkflowById(new NextRequest("http://localhost/api/workflows/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
  });
});
