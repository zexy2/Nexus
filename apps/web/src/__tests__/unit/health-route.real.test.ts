/**
 * Finding: "/api/health exposes config without login".
 *
 * Anonymous callers get overall + per-service status only; configuration
 * (missing env names, providers, queue names, latencies, environment, commit)
 * needs HEALTH_CHECK_TOKEN or a verified admin session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve([{ count: 0, lastHeartbeatAt: new Date() }]).then(resolve);
  return { db: { ...chain, execute: vi.fn(async () => [{ "?column?": 1 }]) } };
});
vi.mock("@nexus/workflows/client", () => ({ createTemporalClient: vi.fn(async () => ({})) }));

const verifySession = vi.fn();
vi.mock("@/lib/api-middleware", () => ({ verifySession: (...a: unknown[]) => verifySession(...a) }));
const isVerifiedAdminUser = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  isVerifiedAdminUser: (...a: unknown[]) => isVerifiedAdminUser(...a),
  getAiProviderStatus: () => ({
    aiEnabled: true,
    geminiAvailable: true,
    openaiAvailable: false,
    tavilyAvailable: false,
    primaryProvider: "gemini",
  }),
}));
vi.mock("@/lib/integrations/impact-graph", () => ({
  getIntegrationProviderConfig: () => ({ configured: false, missing: ["GITHUB_APP_PRIVATE_KEY"] }),
}));

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HEALTH_CHECK_TOKEN", "health-token-123");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ persistence: "postgres" })));
  verifySession.mockResolvedValue(null);
  isVerifiedAdminUser.mockResolvedValue(false);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const req = (headers: Record<string, string> = {}) => new Request("http://localhost:3000/api/health", { headers });

describe("/api/health exposes config without login", () => {
  it("anonymous callers get status only", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.services.database).toEqual({ status: "healthy" });
    expect(body.services.worker).toEqual({ status: expect.any(String) });
    const text = JSON.stringify(body);
    expect(text).not.toContain("GITHUB_APP_PRIVATE_KEY");
    expect(text).not.toContain("geminiAvailable");
    expect(text).not.toContain("environment");
    expect(text).not.toContain("taskQueue");
    expect(verifySession).not.toHaveBeenCalled(); // no cookie: no session lookup
  });

  it("a wrong token gets status only", async () => {
    const body = await (await GET(req({ "x-health-token": "nope" }))).json();
    expect(JSON.stringify(body)).not.toContain("geminiAvailable");
  });

  it("HEALTH_CHECK_TOKEN unlocks details (header or bearer)", async () => {
    for (const headers of [{ "x-health-token": "health-token-123" }, { authorization: "Bearer health-token-123" }]) {
      const body = await (await GET(req(headers))).json();
      expect(body.services.ai.geminiAvailable).toBe(true);
      expect(body.services.integrations.github.missing).toEqual(["GITHUB_APP_PRIVATE_KEY"]);
      expect(body.commitSha).toBeDefined();
    }
  });

  it("verified admins see details; other signed-in users do not", async () => {
    verifySession.mockResolvedValue({ user: { id: "u1", email: "admin@x.com" } });
    const userBody = await (await GET(req({ cookie: "session=1" }))).json();
    expect(userBody.services.ai).toEqual({ status: expect.any(String) });

    isVerifiedAdminUser.mockResolvedValue(true);
    const adminBody = await (await GET(req({ cookie: "session=1" }))).json();
    expect(adminBody.services.ai.geminiAvailable).toBe(true);
  });
});
