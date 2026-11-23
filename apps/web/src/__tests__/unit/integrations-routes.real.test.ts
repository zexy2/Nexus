/**
 * Real route-handler tests for the /api/integrations routes:
 * list, DELETE [id], PATCH [id]/config, GET [id]/resources, POST [id]/sync,
 * POST github/connect and POST linear/connect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  verifySession: (...a: unknown[]) => verifySession(...a),
}));

const integrationFindFirst = vi.fn();
const dbDelete = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    query: { workspaceIntegrations: { findFirst: (...a: unknown[]) => integrationFindFirst(...a) } },
    delete: (...a: unknown[]) => dbDelete(...a),
  },
}));

const requireWorkspaceAccess = vi.fn();
const requireWorkspaceOwner = vi.fn();
const ensureDefaultWorkspace = vi.fn();
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: (...a: unknown[]) => requireWorkspaceAccess(...a),
  requireWorkspaceOwner: (...a: unknown[]) => requireWorkspaceOwner(...a),
  ensureDefaultWorkspace: (...a: unknown[]) => ensureDefaultWorkspace(...a),
}));

const listWorkspaceIntegrations = vi.fn();
const getIntegrationProviderConfig = vi.fn();
vi.mock("@/lib/integrations/impact-graph", () => ({
  listWorkspaceIntegrations: (...a: unknown[]) => listWorkspaceIntegrations(...a),
  getIntegrationProviderConfig: (...a: unknown[]) => getIntegrationProviderConfig(...a),
}));

const { FakeSyncError } = vi.hoisted(() => {
  class FakeSyncError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 500,
      public metadata?: Record<string, unknown>
    ) {
      super(message);
    }
  }
  return { FakeSyncError };
});
const updateIntegrationConfig = vi.fn();
const getIntegrationResources = vi.fn();
const syncIntegrationById = vi.fn();
vi.mock("@/lib/integrations/sync", () => ({
  IntegrationSyncError: FakeSyncError,
  updateIntegrationConfig: (...a: unknown[]) => updateIntegrationConfig(...a),
  getIntegrationResources: (...a: unknown[]) => getIntegrationResources(...a),
  syncIntegrationById: (...a: unknown[]) => syncIntegrationById(...a),
}));

const isDemoEmail = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  isDemoEmail: (...a: unknown[]) => isDemoEmail(...a),
}));

const createIntegrationConnectState = vi.fn();
vi.mock("@/lib/integrations/crypto", () => ({
  createIntegrationConnectState: (...a: unknown[]) => createIntegrationConnectState(...a),
  getCanonicalAppUrl: (origin: string) => origin,
}));
vi.mock("@/lib/integrations/providers/github-client", () => ({
  getGitHubAppConfig: () => ({ clientId: "gh-client" }),
}));

vi.mock("@/lib/api-response", () => ({
  logInternalError: () => "req-123",
}));

import { NextRequest } from "next/server";
import { GET as listGET } from "@/app/api/integrations/route";
import { DELETE as integrationDELETE } from "@/app/api/integrations/[id]/route";
import { PATCH as configPATCH } from "@/app/api/integrations/[id]/config/route";
import { GET as resourcesGET } from "@/app/api/integrations/[id]/resources/route";
import { POST as syncPOST } from "@/app/api/integrations/[id]/sync/route";
import { POST as githubConnectPOST } from "@/app/api/integrations/github/connect/route";
import { POST as linearConnectPOST } from "@/app/api/integrations/linear/connect/route";

const authed = { user: { id: "user-1", email: "u@x.com", name: "U" } };
const ctx = (id = "int-1") => ({ params: Promise.resolve({ id }) });
const req = (url: string, init?: RequestInit) => new NextRequest(`http://localhost:3000${url}`, init as never);
const jsonReq = (url: string, method: string, body: unknown) =>
  req(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const integration = { id: "int-1", workspaceId: "ws-1" };
const denied = { ok: false, status: 403, error: "Forbidden" };

beforeEach(() => {
  vi.resetAllMocks();
  verifySession.mockResolvedValue(authed);
  isDemoEmail.mockReturnValue(false);
  requireWorkspaceAccess.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  requireWorkspaceOwner.mockResolvedValue({ ok: true, workspaceId: "ws-1" });
  ensureDefaultWorkspace.mockResolvedValue({ id: "ws-default" });
  integrationFindFirst.mockResolvedValue(integration);
});

describe("GET /api/integrations", () => {
  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await listGET(req("/api/integrations"))).status).toBe(401);
  });

  it("forwards workspace access failures", async () => {
    requireWorkspaceAccess.mockResolvedValue(denied);
    expect((await listGET(req("/api/integrations?workspaceId=ws-x"))).status).toBe(403);
  });

  it("lists integrations and provider configs for the default workspace", async () => {
    listWorkspaceIntegrations.mockResolvedValue([{ id: "int-1" }]);
    getIntegrationProviderConfig.mockImplementation((p: string) => ({ provider: p, configured: true }));
    const res = await listGET(req("/api/integrations"));
    expect(res.status).toBe(200);
    expect(ensureDefaultWorkspace).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual({
      integrations: [{ id: "int-1" }],
      providers: {
        github: { provider: "github", configured: true },
        linear: { provider: "linear", configured: true },
      },
    });
  });
});

describe("DELETE /api/integrations/[id]", () => {
  const del = () => integrationDELETE(req("/api/integrations/int-1", { method: "DELETE" }), ctx());

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
  });

  it("returns 404 for an unknown integration", async () => {
    integrationFindFirst.mockResolvedValue(undefined);
    expect((await del()).status).toBe(404);
  });

  it("requires workspace ownership", async () => {
    requireWorkspaceOwner.mockResolvedValue(denied);
    const res = await del();
    expect(res.status).toBe(403);
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("deletes the integration", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    dbDelete.mockReturnValue({ where });
    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/integrations/[id]/config", () => {
  const patch = (body: unknown) => configPATCH(jsonReq("/api/integrations/int-1/config", "PATCH", body), ctx());

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await patch({})).status).toBe(401);
  });

  it("returns 404 for an unknown integration", async () => {
    integrationFindFirst.mockResolvedValue(undefined);
    expect((await patch({})).status).toBe(404);
  });

  it("requires workspace ownership", async () => {
    requireWorkspaceOwner.mockResolvedValue(denied);
    expect((await patch({ selectedRepository: "o/r" })).status).toBe(403);
    expect(updateIntegrationConfig).not.toHaveBeenCalled();
  });

  it("passes only well-typed fields to the config update", async () => {
    updateIntegrationConfig.mockResolvedValue({ selectedRepository: "o/r" });
    const res = await patch({ selectedRepository: "o/r", selectedTeamId: 42, selectedProjectId: null });
    expect(res.status).toBe(200);
    expect(updateIntegrationConfig).toHaveBeenCalledWith("int-1", {
      selectedRepository: "o/r",
      selectedTeamId: undefined,
      selectedProjectId: null,
    });
    expect(await res.json()).toEqual({ ok: true, metadata: { selectedRepository: "o/r" } });
  });

  it("maps IntegrationSyncError to its status and code", async () => {
    updateIntegrationConfig.mockRejectedValue(new FakeSyncError("REPO_NOT_FOUND", "nope", 422, { x: 1 }));
    const res = await patch({ selectedRepository: "o/r" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "REPO_NOT_FOUND", metadata: { x: 1 } });
  });

  it("maps unexpected errors to 500 INTEGRATION_CONFIG_FAILED", async () => {
    updateIntegrationConfig.mockRejectedValue(new Error("boom"));
    const res = await patch({});
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "INTEGRATION_CONFIG_FAILED", requestId: "req-123" });
  });
});

describe("GET /api/integrations/[id]/resources", () => {
  const get = () => resourcesGET(req("/api/integrations/int-1/resources"), ctx());

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("returns 404 for an unknown integration", async () => {
    integrationFindFirst.mockResolvedValue(undefined);
    expect((await get()).status).toBe(404);
  });

  it("forwards workspace access failures", async () => {
    requireWorkspaceAccess.mockResolvedValue(denied);
    expect((await get()).status).toBe(403);
  });

  it("returns provider resources", async () => {
    getIntegrationResources.mockResolvedValue({ repositories: [] });
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, resources: { repositories: [] } });
  });

  it("maps IntegrationSyncError and unexpected errors", async () => {
    getIntegrationResources.mockRejectedValueOnce(new FakeSyncError("TOKEN_EXPIRED", "expired", 401));
    const known = await get();
    expect(known.status).toBe(401);
    expect((await known.json()).error).toBe("TOKEN_EXPIRED");

    getIntegrationResources.mockRejectedValueOnce(new Error("boom"));
    const unknown = await get();
    expect(unknown.status).toBe(502);
    expect((await unknown.json()).error).toBe("PROVIDER_API_FAILED");
  });
});

describe("POST /api/integrations/[id]/sync", () => {
  const post = () => syncPOST(req("/api/integrations/int-1/sync", { method: "POST" }), ctx());

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("returns 404 for an unknown integration", async () => {
    integrationFindFirst.mockResolvedValue(undefined);
    expect((await post()).status).toBe(404);
  });

  it("forwards workspace access failures", async () => {
    requireWorkspaceAccess.mockResolvedValue(denied);
    const res = await post();
    expect(res.status).toBe(403);
    expect(syncIntegrationById).not.toHaveBeenCalled();
  });

  it("runs the sync and spreads its result", async () => {
    syncIntegrationById.mockResolvedValue({ synced: 4 });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, synced: 4 });
  });

  it("maps IntegrationSyncError and unexpected errors", async () => {
    syncIntegrationById.mockRejectedValueOnce(new FakeSyncError("RATE_LIMITED", "slow down", 429));
    expect((await post()).status).toBe(429);

    syncIntegrationById.mockRejectedValueOnce(new Error("boom"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "PROVIDER_API_FAILED", requestId: "req-123" });
  });
});

describe.each([
  {
    name: "github",
    handler: githubConnectPOST,
    path: "/api/integrations/github/connect",
    notConfiguredError: "GITHUB_APP_NOT_CONFIGURED",
    authorizeHost: "github.com",
  },
  {
    name: "linear",
    handler: linearConnectPOST,
    path: "/api/integrations/linear/connect",
    notConfiguredError: "LINEAR_OAUTH_NOT_CONFIGURED",
    authorizeHost: "linear.app",
  },
])("POST /api/integrations/$name/connect", ({ name, handler, path, notConfiguredError, authorizeHost }) => {
  const post = (body: unknown = {}) => handler(jsonReq(path, "POST", body));

  beforeEach(() => {
    process.env.LINEAR_CLIENT_ID = "lin-client";
    delete process.env.LINEAR_REDIRECT_URI;
  });
  afterEach(() => {
    delete process.env.LINEAR_CLIENT_ID;
  });

  it("returns 401 when unauthenticated", async () => {
    verifySession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
  });

  it("is disabled for demo users", async () => {
    isDemoEmail.mockReturnValue(true);
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("DEMO_INTEGRATION_DISABLED");
  });

  it("requires workspace ownership", async () => {
    requireWorkspaceOwner.mockResolvedValue(denied);
    expect((await post({ workspaceId: "ws-x" })).status).toBe(403);
    expect(createIntegrationConnectState).not.toHaveBeenCalled();
  });

  it("returns 503 when the provider is not configured", async () => {
    getIntegrationProviderConfig.mockReturnValue({ configured: false, missing: ["CLIENT_ID"] });
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: notConfiguredError, missing: ["CLIENT_ID"] });
  });

  it("returns an authorize URL carrying the signed state", async () => {
    getIntegrationProviderConfig.mockReturnValue({ configured: true });
    createIntegrationConnectState.mockResolvedValue("signed-state");
    const res = await post({ workspaceId: "ws-7" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const url = new URL(body.authUrl);
    expect(url.hostname).toBe(authorizeHost);
    expect(url.searchParams.get("redirect_uri")).toContain(`/api/integrations/${name}/callback`);
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(createIntegrationConnectState).toHaveBeenCalledWith(
      expect.objectContaining({ provider: name, workspaceId: "ws-7", userId: "user-1" })
    );
  });
});
