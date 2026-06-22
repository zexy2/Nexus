import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const betterAuthPost = vi.fn();
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({
    GET: vi.fn(),
    POST: (...args: unknown[]) => betterAuthPost(...args),
  }),
}));

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

const selectLimit = vi.fn();
const selectWhere = vi.fn(() => ({ limit: selectLimit }));
const selectFrom = vi.fn(() => ({ where: selectWhere }));
vi.mock("@/lib/db", () => ({
  db: { select: () => ({ from: (...args: unknown[]) => selectFrom(...args) }) },
}));

const writeAuditLog = vi.fn();
vi.mock("@/lib/production-guardrails", () => ({
  isPublicSignupEnabled: () => false,
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}));

import { POST } from "@/app/api/auth/[...all]/route";

function request(path: string) {
  return new NextRequest(`http://localhost:3000/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeAuditLog.mockResolvedValue(undefined);
  betterAuthPost.mockResolvedValue(new Response("{}", { status: 200 }));
  getSession.mockResolvedValue({ user: { id: "demo-user" } });
  selectLimit.mockResolvedValue([{ isDemo: true }]);
});

describe("Better Auth demo account guard", () => {
  it("blocks credential/profile mutations for temporary demo identities", async () => {
    const response = await POST(request("update-user"));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("DEMO_ACCOUNT_IMMUTABLE");
    expect(betterAuthPost).not.toHaveBeenCalled();
  });

  it("still permits demo users to sign out", async () => {
    const response = await POST(request("sign-out"));
    expect(response.status).toBe(200);
    expect(betterAuthPost).toHaveBeenCalledOnce();
  });
});
