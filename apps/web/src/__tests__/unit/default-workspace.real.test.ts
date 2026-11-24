/**
 * Finding: "Missing unique constraints (duplicate default workspaces)".
 *
 * ensureDefaultWorkspace used find-then-insert, so concurrent first requests
 * each created a "My Workspace". Migration 0015 adds workspaces.is_default
 * with a partial unique index (one default per owner); this test drives the
 * real function against an in-memory table that enforces that index.
 */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compileWhere } from "../helpers/fake-db";

type Ws = { id: string; ownerId: string; name: string; isDefault: boolean; createdAt: Date };
const store = vi.hoisted(() => ({ rows: [] as Ws[], nextId: 1 }));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function violatesDefaultIndex(candidate: Ws, ignoreId?: string) {
  return (
    candidate.isDefault &&
    store.rows.some((row) => row.id !== ignoreId && row.ownerId === candidate.ownerId && row.isDefault)
  );
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      workspaces: {
        findFirst: async ({ where }: { where: SQL }) => {
          await tick();
          const match = compileWhere(where);
          return [...store.rows]
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .find((row) => match(row as never));
        },
      },
    },
    insert: () => ({
      values: (values: Omit<Ws, "id" | "createdAt">) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            await tick();
            const row: Ws = { ...values, id: `ws-${store.nextId++}`, createdAt: new Date() } as Ws;
            if (violatesDefaultIndex(row)) return [];
            store.rows.push(row);
            return [{ ...row }];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: Partial<Ws>) => ({
        where: (where: SQL) => ({
          returning: async () => {
            await tick();
            const match = compileWhere(where);
            const targets = store.rows.filter((row) => match(row as never));
            for (const row of targets) {
              if (violatesDefaultIndex({ ...row, ...values }, row.id)) {
                throw Object.assign(new Error("duplicate key"), {
                  code: "23505",
                  constraint_name: "workspaces_owner_default_idx",
                });
              }
            }
            targets.forEach((row) => Object.assign(row, values));
            return targets.map((row) => ({ ...row }));
          },
        }),
      }),
    }),
  },
}));

import { ensureDefaultWorkspace } from "@/lib/workspace-auth";

beforeEach(() => {
  store.rows = [];
  store.nextId = 1;
});

describe("Missing unique constraints: duplicate default workspaces", () => {
  it("concurrent first requests create exactly one default workspace", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureDefaultWorkspace("user-1")));
    expect(store.rows).toHaveLength(1);
    expect(new Set(results.map((ws) => ws.id))).toEqual(new Set([store.rows[0]!.id]));
    expect(store.rows[0]!.isDefault).toBe(true);
  });

  it("promotes the oldest existing workspace when none is flagged, without creating another", async () => {
    store.rows.push(
      { id: "old", ownerId: "user-1", name: "A", isDefault: false, createdAt: new Date("2025-01-01") },
      { id: "new", ownerId: "user-1", name: "B", isDefault: false, createdAt: new Date("2025-06-01") }
    );
    const results = await Promise.all([ensureDefaultWorkspace("user-1"), ensureDefaultWorkspace("user-1")]);
    expect(results.map((ws) => ws.id)).toEqual(["old", "old"]);
    expect(store.rows).toHaveLength(2);
    expect(store.rows.filter((row) => row.isDefault).map((row) => row.id)).toEqual(["old"]);
  });

  it("returns the flagged default even if it is not the oldest", async () => {
    store.rows.push(
      { id: "old", ownerId: "user-1", name: "A", isDefault: false, createdAt: new Date("2025-01-01") },
      { id: "flagged", ownerId: "user-1", name: "B", isDefault: true, createdAt: new Date("2025-06-01") }
    );
    expect((await ensureDefaultWorkspace("user-1")).id).toBe("flagged");
  });
});
