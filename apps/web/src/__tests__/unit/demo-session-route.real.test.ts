import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { DemoCapacityError } = vi.hoisted(() => ({
  DemoCapacityError: class DemoCapacityError extends Error {},
}));

const protectRoute = vi.fn();
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: (...args: unknown[]) => protectRoute(...args),
  RATE_LIMITS: { demoLogin: { windowMs: 60_000, maxRequests: 5 } },
}));

const isDemoMode = vi.fn();
const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  isDemoMode: () => isDemoMode(),
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

const getSession = vi.fn();
const signInEmail = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args), signInEmail: (...args: unknown[]) => signInEmail(...args) } },
}));

const selectLimit = vi.fn();
const selectWhere = vi.fn(() => ({ limit: selectLimit }));
const selectFrom = vi.fn(() => ({ where: selectWhere }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: (...args: unknown[]) => selectFrom(...args) }) },
}));

const provisionIsolatedDemoSession = vi.fn();
const expireProvisionedDemoUser = vi.fn();
const clampDemoSessionExpiry = vi.fn();
const secureAccessCodeMatches = vi.fn();
vi.mock("@/lib/demo-sessions", () => ({
  provisionIsolatedDemoSession: (...args: unknown[]) => provisionIsolatedDemoSession(...args),
  expireProvisionedDemoUser: (...args: unknown[]) => expireProvisionedDemoUser(...args),
  clampDemoSessionExpiry: (...args: unknown[]) => clampDemoSessionExpiry(...args),
  secureAccessCodeMatches: (...args: unknown[]) => secureAccessCodeMatches(...args),
  DemoCapacityError,
}));

import { POST } from "@/app/api/demo/session/route";

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/demo/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DEMO_ACCESS_CODE;
  protectRoute.mockResolvedValue({ success: true });
  isDemoMode.mockReturnValue(true);
  getSession.mockResolvedValue(null);
  writeAuditLog.mockResolvedValue(undefined);
  expireProvisionedDemoUser.mockResolvedValue(undefined);
  clampDemoSessionExpiry.mockResolvedValue(undefined);
  secureAccessCodeMatches.mockReturnValue(true);
  provisionIsolatedDemoSession.mockResolvedValue({
    userId: "demo-user-1",
    email: "demo-1@sessions.nexus.invalid",
    password: "server-only-password",
    workspaceId: "00000000-0000-0000-0000-000000000001",
    expiresAt: new Date("2026-06-22T12:00:00.000Z"),
  });
  signInEmail.mockResolvedValue(
    new Response("{}", { status: 200, headers: { "set-cookie": "session=test; HttpOnly; SameSite=Lax" } })
  );
});

describe("POST /api/demo/session", () => {
  it("returns 403 when demo mode is disabled", async () => {
    isDemoMode.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(provisionIsolatedDemoSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid access code before provisioning", async () => {
    process.env.DEMO_ACCESS_CODE = "expected";
    secureAccessCodeMatches.mockReturnValue(false);
    const response = await POST(request({ accessCode: "wrong" }));
    expect(response.status).toBe(403);
    expect(provisionIsolatedDemoSession).not.toHaveBeenCalled();
  });

  it("does not replace an authenticated real-user session", async () => {
    getSession.mockResolvedValue({ user: { id: "real-user" } });
    selectLimit.mockResolvedValue([{ isDemo: false, demoExpiresAt: null }]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).reusedSession).toBe(true);
    expect(provisionIsolatedDemoSession).not.toHaveBeenCalled();
  });

  it("creates an isolated session without exposing generated credentials", async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, redirectTo: "/dashboard" });
    expect(JSON.stringify(body)).not.toContain("server-only-password");
    expect(response.headers.get("set-cookie")).toContain("session=test");
    expect(clampDemoSessionExpiry).toHaveBeenCalledWith(
      "demo-user-1",
      new Date("2026-06-22T12:00:00.000Z")
    );
  });

  it("returns a controlled response when concurrent demo capacity is full", async () => {
    provisionIsolatedDemoSession.mockRejectedValue(new DemoCapacityError());
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("DEMO_CAPACITY_REACHED");
  });
});
