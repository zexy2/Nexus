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

import { enforceAiBudget } from "@/lib/production-guardrails";

beforeEach(() => {
  vi.clearAllMocks();
  selectRows.length = 0;
  process.env.AI_ENABLED = "true";
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.ADMIN_EMAILS;
});

describe("atomic AI budget consumption", () => {
  it("does not consume any bucket when one limit is already exhausted", async () => {
    const future = new Date(Date.now() + 60_000);
    selectRows.push(
      { count: 2, resetAt: future },
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
