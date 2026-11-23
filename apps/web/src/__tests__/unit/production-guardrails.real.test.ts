import { beforeEach, describe, expect, it, vi } from "vitest";

const txInsert = vi.fn();
const auditValues = vi.fn(async () => undefined);
const selectRows: Array<Record<string, unknown> | null> = [];

const tx = {
  execute: vi.fn(async () => undefined),
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const row = selectRows.shift();
          return row ? [row] : [];
        },
      }),
    }),
  })),
  insert: txInsert,
};

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (callback: (transaction: typeof tx) => unknown) => callback(tx),
    insert: () => ({ values: auditValues }),
  },
}));

import { AI_LIMIT_DEFAULTS, enforceAiBudget, getAiUsageLimits } from "@/lib/production-guardrails";

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.length = 0;
  process.env.AI_ENABLED = "true";
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.ADMIN_EMAILS;
  for (const k of Object.keys(process.env)) if (k.startsWith("AI_") && k !== "AI_ENABLED") delete process.env[k];
});

describe("atomic AI budget consumption", () => {
  it("does not consume any bucket when one limit is already exhausted", async () => {
    const future = new Date(Date.now() + 60_000);
    selectRows.push(
      { count: 50, resetAt: future },
      { count: 0, resetAt: future },
      { count: 0, resetAt: future },
      { count: 0, resetAt: future },
      { count: 0, resetAt: future }
    );

    const result = await enforceAiBudget({
      userId: "user-1",
      email: "user@example.com",
      kind: "workflow",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(429);
    expect(txInsert).not.toHaveBeenCalled();
    expect(auditValues).toHaveBeenCalledOnce();
  });
});

describe("AI usage limits configuration", () => {
  it("applies owner defaults for regular users, global cap, demo and admin", () => {
    expect(getAiUsageLimits(false, false)).toMatchObject({
      globalDaily: 5000, globalMinute: 120, userDaily: 200, userMinute: 20, workflowDaily: 50, chatDaily: 200,
    });
    expect(getAiUsageLimits(false, true)).toMatchObject({
      userDaily: 3, userMinute: 1, workflowDaily: 2, chatDaily: 1, globalDaily: 5000,
    });
    expect(getAiUsageLimits(true, false)).toMatchObject({ userDaily: 400, userMinute: 40, workflowDaily: 100, chatDaily: 400 });
    expect(AI_LIMIT_DEFAULTS.demoDaily).toBe(3);
  });

  it("applies env overrides", () => {
    process.env.AI_GLOBAL_DAILY_LIMIT = "10";
    process.env.AI_GLOBAL_PER_MINUTE_LIMIT = "7";
    process.env.AI_USER_DAILY_LIMIT = "9";
    process.env.AI_USER_PER_MINUTE_LIMIT = "3";
    process.env.AI_DEMO_DAILY_LIMIT = "6";
    expect(getAiUsageLimits(false, false)).toMatchObject({ globalDaily: 10, globalMinute: 7, userDaily: 9, userMinute: 3 });
    expect(getAiUsageLimits(false, true).userDaily).toBe(6);
  });

  it("falls back to defaults and warns on invalid values; blank is silent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.AI_GLOBAL_DAILY_LIMIT = "abc";
    process.env.AI_USER_DAILY_LIMIT = "-5";
    process.env.AI_USER_PER_MINUTE_LIMIT = "1.5";
    process.env.AI_GLOBAL_PER_MINUTE_LIMIT = "";
    const limits = getAiUsageLimits(false, false);
    expect(limits).toMatchObject({ globalDaily: 5000, userDaily: 200, userMinute: 20, globalMinute: 120 });
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("AI budget enforcement scopes", () => {
  const future = () => new Date(Date.now() + 60_000);

  it("blocks on the per-user daily limit while the global budget has room", async () => {
    // order: kind daily, user minute, user daily, global minute, global daily
    selectRows.push(
      { count: 0, resetAt: future() },
      { count: 0, resetAt: future() },
      { count: 200, resetAt: future() },
      { count: 0, resetAt: future() },
      { count: 0, resetAt: future() }
    );
    const result = await enforceAiBudget({ userId: "u", email: "u@example.com", kind: "research" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect((await result.response.json()).limit).toBe(200);
  });

  it("blocks on the global cap while the user is well under their limit", async () => {
    selectRows.push(
      { count: 0, resetAt: future() },
      { count: 0, resetAt: future() },
      { count: 0, resetAt: future() },
      { count: 0, resetAt: future() },
      { count: 5000, resetAt: future() }
    );
    const result = await enforceAiBudget({ userId: "u", email: "u@example.com", kind: "research" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect((await result.response.json()).limit).toBe(5000);
  });

  it("allows a regular user beyond the old caps (e.g. 25th call today)", async () => {
    selectRows.push(
      { count: 24, resetAt: future() },
      { count: 1, resetAt: future() },
      { count: 24, resetAt: future() },
      { count: 24, resetAt: future() },
      { count: 24, resetAt: future() }
    );
    txInsert.mockImplementation(() => ({
      values: (v: { count: number; resetAt: Date }) => ({
        onConflictDoUpdate: () => ({ returning: async () => [{ count: v.count + 4, resetAt: v.resetAt }] }),
      }),
    }));
    const result = await enforceAiBudget({ userId: "u", email: "u@example.com", kind: "research" });
    expect(result.ok).toBe(true);
  });
});
