import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
  userRow: null as null | { email: string; emailVerified: boolean },
  auditInserts: 0,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (dbState.userRow ? [dbState.userRow] : []),
        }),
      }),
    }),
    insert: () => ({
      values: async () => {
        dbState.auditInserts += 1;
      },
    }),
  },
}));

import { beforeUserCreate } from "@/lib/auth-signup-guard";
import { isAdminEmail, isVerifiedAdminUser } from "@/lib/production-guardrails";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  dbState.userRow = null;
  dbState.auditInserts = 0;
  process.env.ADMIN_EMAILS = "admin@nexus.dev";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("social signup guard (databaseHooks.user.create.before)", () => {
  const newUser = { email: "new@github.example", name: "New", emailVerified: true };

  it("blocks new-user creation when public signup is disabled", async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = "false";

    await expect(beforeUserCreate(newUser)).resolves.toBe(false);
    expect(dbState.auditInserts).toBe(1);
  });

  it("allows new-user creation when public signup is enabled", async () => {
    process.env.PUBLIC_SIGNUP_ENABLED = "true";

    await expect(beforeUserCreate(newUser)).resolves.toEqual({ data: newUser });
  });

  it("is wired as a create-only hook, so existing-user social login is unaffected", async () => {
    // better-auth resolves an existing user (by linked account or email)
    // before it ever calls createOAuthUser, so user.create.before only runs
    // for brand-new identities. Verify the config wiring:
    vi.resetModules();
    const betterAuth = vi.fn((options: unknown) => ({ options, api: {}, $Infer: {} }));
    vi.doMock("better-auth", () => ({ betterAuth }));
    vi.doMock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }));
    process.env.PUBLIC_SIGNUP_ENABLED = "false";
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";

    await import("@/lib/auth");
    const options = betterAuth.mock.calls[0][0] as {
      databaseHooks: { user: { create: { before: (u: unknown) => Promise<unknown> } } };
      socialProviders: { github: { disableSignUp: boolean } };
    };

    expect(options.socialProviders.github.disableSignUp).toBe(true);
    await expect(options.databaseHooks.user.create.before(newUser)).resolves.toBe(false);
    // No session/update hooks are registered, so existing users still log in.
    expect(Object.keys(options.databaseHooks.user)).toEqual(["create"]);
    expect(Object.keys(options.databaseHooks)).toEqual(["user"]);

    vi.doUnmock("better-auth");
    vi.doUnmock("better-auth/adapters/drizzle");
  });
});

describe("admin privilege requires a verified email", () => {
  it("does not grant admin to an allow-listed but unverified email", () => {
    expect(isAdminEmail("admin@nexus.dev", false)).toBe(false);
    expect(isAdminEmail("admin@nexus.dev", undefined)).toBe(false);
    expect(isAdminEmail("admin@nexus.dev")).toBe(false);
  });

  it("grants admin only to a verified, allow-listed email", () => {
    expect(isAdminEmail("Admin@Nexus.dev", true)).toBe(true);
    expect(isAdminEmail("someone@nexus.dev", true)).toBe(false);
  });

  it("resolves verification from the database for budget checks", async () => {
    dbState.userRow = { email: "admin@nexus.dev", emailVerified: false };
    await expect(isVerifiedAdminUser("user-1", "admin@nexus.dev")).resolves.toBe(false);

    dbState.userRow = { email: "admin@nexus.dev", emailVerified: true };
    await expect(isVerifiedAdminUser("user-1", "admin@nexus.dev")).resolves.toBe(true);

    dbState.userRow = null;
    await expect(isVerifiedAdminUser("user-1", "admin@nexus.dev")).resolves.toBe(false);
  });
});
