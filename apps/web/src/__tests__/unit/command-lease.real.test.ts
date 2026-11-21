/**
 * Ask Nexus commands run in-process after the response. If the worker is
 * recycled mid-run the row would stay "running" forever; the lease
 * (heartbeat_at + TTL) lets readers mark such rows failed and retryable.
 */
import { NextRequest } from "next/server";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Execution = Record<string, unknown> & { id: string; status: string; createdAt: Date };
const store = vi.hoisted(() => ({ executions: [] as Array<Record<string, unknown>>, nextId: 1 }));

/** Fake for agent_executions covering the queries the command route issues. */
vi.mock("@/lib/db", () => {
  const dialect = new PgDialect();
  const latest = () => [...store.executions].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
  const selectChain = (rows: () => unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve);
    return chain;
  };
  return {
    db: {
      select: () => selectChain(() => latest().slice(0, 1).map((row) => ({ ...row }))),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          returning: async () => {
            const row = { id: `exec-${store.nextId++}`, createdAt: new Date(), heartbeatAt: null, ...values };
            store.executions.push(row);
            return [{ ...row }];
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: (where: SQL) => {
            const { sql, params } = dialect.sqlToQuery(where);
            const apply = () => {
              const matches = store.executions.filter((row) => {
                if (row.id !== params[0]) return false;
                if (sql.includes("coalesce(")) {
                  // Lease expiry: id, status in (pending, running), lease older than cutoff.
                  expect(sql).toMatch(/"status" in \(\$2, \$3\) and coalesce\(/);
                  const [, s1, s2, cutoff] = params as string[];
                  const lease = (row.heartbeatAt ?? row.startedAt ?? row.createdAt) as Date;
                  return [s1, s2].includes(row.status as string) && lease.getTime() < new Date(cutoff!).getTime();
                }
                // Terminal write / heartbeat: id and status = 'running'.
                expect(sql).toMatch(/"id" = \$1 and "agent_executions"\."status" = \$2/);
                return row.status === params[1];
              });
              matches.forEach((row) => Object.assign(row, values));
              return matches.map((row) => ({ ...row }));
            };
            return {
              returning: async () => apply(),
              then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve().then(apply).then(() => undefined).then(resolve, reject),
              catch: () => Promise.resolve().then(apply),
            };
          },
        }),
      }),
    },
  };
});

const user = { id: "user-1", email: "user@example.com" };
vi.mock("@/lib/api-middleware", () => ({
  protectRoute: vi.fn(async () => ({ success: true, user })),
  RATE_LIMITS: { commands: {} },
}));
vi.mock("@/lib/production-guardrails", () => ({
  enforceAiBudget: vi.fn(async () => ({ ok: true })),
  writeAuditLog: vi.fn(async () => undefined),
}));
vi.mock("@/lib/workspace-auth", () => ({
  requireWorkspaceAccess: vi.fn(async () => ({ ok: true, workspaceId: "ws-1", role: "owner" })),
}));
vi.mock("@/lib/ai/model-config", () => ({ getUserModelConfig: vi.fn(async () => ({ model: {} })) }));
const runAgent = vi.fn();
vi.mock("@/lib/ai/agent", () => ({ runAgent: (...args: unknown[]) => runAgent(...args) }));

import { GET as commandStatus, POST as processCommand } from "@/app/api/commands/process/route";
import {
  COMMAND_LEASE_EXPIRED_ERROR,
  COMMAND_LEASE_TTL_MS,
  expireStaleCommandExecution,
  isCommandLeaseExpired,
} from "@/lib/command-lease";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

function seedRunning(heartbeatAt: Date | null, startedAt = minutesAgo(30)) {
  const row: Execution = {
    id: "exec-old",
    workspaceId: "ws-1",
    agentType: "supervisor",
    status: "running",
    input: { commandId: "cmd-1", userId: "user-1", command: "do it" },
    output: null,
    errorMessage: null,
    temporalWorkflowId: "cmd-cmd-1",
    startedAt,
    heartbeatAt,
    completedAt: null,
    createdAt: startedAt,
  };
  store.executions.push(row);
  return row;
}

const status = () => commandStatus(new NextRequest("http://localhost:3000/api/commands/process?id=cmd-1"));
const post = () =>
  processCommand(
    new NextRequest("http://localhost:3000/api/commands/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: "cmd-1", command: "do it", workspaceId: "ws-1" }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.executions = [];
  store.nextId = 1;
  runAgent.mockImplementation(() => new Promise(() => undefined)); // never finishes
});

afterEach(() => {
  vi.useRealTimers();
});

describe("command lease", () => {
  it("stale running command marked failed", async () => {
    const row = seedRunning(minutesAgo(10));

    const response = await status();
    const body = await response.json();

    expect(body).toMatchObject({ status: "failed", error: COMMAND_LEASE_EXPIRED_ERROR });
    expect(row.status).toBe("failed");
    expect(row.completedAt).toBeInstanceOf(Date);
  });

  it("a command that is still heartbeating stays processing", async () => {
    const row = seedRunning(minutesAgo(0.5));
    const body = await (await status()).json();
    expect(body.status).toBe("processing");
    expect(row.status).toBe("running");
  });

  it("a retry after the lease expired starts a fresh execution instead of 'already started'", async () => {
    seedRunning(minutesAgo(10));

    const body = await (await post()).json();

    expect(body.message).toBe("Command processing started");
    expect(body.executionId).not.toBe("exec-old");
    expect(store.executions.find((row) => row.id === "exec-old")?.status).toBe("failed");
    const fresh = store.executions.find((row) => row.id === body.executionId)!;
    expect(fresh).toMatchObject({ status: "running", heartbeatAt: expect.any(Date) });
  });

  it("a retry while the lease is alive is deduplicated", async () => {
    seedRunning(minutesAgo(1));
    const body = await (await post()).json();
    expect(body).toMatchObject({ executionId: "exec-old", message: "Command processing already started" });
  });

  it("never expires a row the guarded UPDATE no longer matches (e.g. it just completed)", async () => {
    const row = seedRunning(minutesAgo(10));
    const stale = { ...row } as never;
    row.status = "completed";
    const result = await expireStaleCommandExecution(stale);
    expect(result).toMatchObject({ status: "completed" });
    expect(row.errorMessage).toBeNull();
  });

  it("only applies to in-process command rows", () => {
    const base = { status: "running", heartbeatAt: null, startedAt: minutesAgo(60), createdAt: minutesAgo(60) };
    expect(isCommandLeaseExpired({ ...base, temporalWorkflowId: "cmd-x" })).toBe(true);
    expect(isCommandLeaseExpired({ ...base, temporalWorkflowId: "research-123" })).toBe(false);
    expect(isCommandLeaseExpired({ ...base, temporalWorkflowId: "cmd-x", heartbeatAt: new Date(Date.now() - COMMAND_LEASE_TTL_MS + 5_000) })).toBe(false);
  });

  it("a late finish after the lease expired does not overwrite the failure", async () => {
    let finish!: (value: unknown) => void;
    runAgent.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { executionId } = await (await post()).json();
    const row = store.executions.find((candidate) => candidate.id === executionId)!;
    row.status = "failed"; // expired by a reader in the meantime

    finish({ text: "done", toolsUsed: [], createdDocs: [], createdTasks: [] });
    await vi.waitFor(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(row.status).toBe("failed");
      expect(row.output ?? null).toBeNull();
    });
  });

  it("refreshes the heartbeat while the command runs", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { executionId } = await (await post()).json();
    const row = store.executions.find((candidate) => candidate.id === executionId)!;
    row.heartbeatAt = minutesAgo(4);
    vi.advanceTimersByTime(31_000);
    await vi.waitFor(() => expect((row.heartbeatAt as Date).getTime()).toBeGreaterThan(Date.now() - 5_000));
  });
});
