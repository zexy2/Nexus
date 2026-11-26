/**
 * Cancellation + replay-safety tests for planImpactWorkflow on the Temporal
 * time-skipping test server.
 *
 * The activities are backed by a tiny in-memory change-set store so the tests
 * can assert the externally visible invariant: after a cancel no change set is
 * left `pending`, i.e. the plan doc is not blocked from new analyses.
 *
 * The replay tests run histories produced by the pre-cancellation workflow
 * code (fixtures/plan-impact-v0.workflow.ts) through the current bundle, which
 * is exactly what happens to in-flight executions after a worker deploy.
 */
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { CancelledFailure, WorkflowFailedError, type WorkflowHandle } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import {
  bundleWorkflowCode,
  DefaultLogger,
  Runtime,
  Worker,
  type WorkflowBundleWithSourceMap,
} from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PlanImpactOutput } from "../types";

let env: TestWorkflowEnvironment;
let currentBundle: WorkflowBundleWithSourceMap;
let v0Bundle: WorkflowBundleWithSourceMap;

beforeAll(async () => {
  Runtime.install({ logger: new DefaultLogger("ERROR") });
  env = await TestWorkflowEnvironment.createTimeSkipping();
  [currentBundle, v0Bundle] = await Promise.all([
    bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("../workflows.ts", import.meta.url)),
      logger: new DefaultLogger("ERROR"),
    }),
    bundleWorkflowCode({
      workflowsPath: fileURLToPath(new URL("./fixtures/plan-impact-v0.workflow.ts", import.meta.url)),
      logger: new DefaultLogger("ERROR"),
    }),
  ]);
});

afterAll(async () => {
  await env?.teardown();
});

type ChangeSetRow = { id: string; docId: string; workflowId: string; status: string };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** In-memory stand-in for change_sets with the real activities' semantics. */
function planStore(options: { analysisGate?: Promise<void>; applyGate?: Promise<void> } = {}) {
  const changeSets = new Map<string, ChangeSetRow>();
  const acts = {
    analyzePlanImpact: vi.fn(async (input: { docId: string }) => {
      await options.analysisGate;
      return { docId: input.docId };
    }),
    persistPlanImpact: vi.fn(async (analysis: { docId: string }, workflowId: string) => {
      const id = `cs-${workflowId}`;
      if (!changeSets.has(id)) {
        changeSets.set(id, { id, docId: analysis.docId, workflowId, status: "pending" });
      }
      return { changeSetId: id, versionNumber: 2, summary: "s", stats: {}, steps: [] };
    }),
    cancelPlanImpactRun: vi.fn(async (workflowId: string) => {
      const cancelledChangeSetIds: string[] = [];
      for (const row of changeSets.values()) {
        if (row.workflowId === workflowId && row.status === "pending") {
          row.status = "cancelled";
          cancelledChangeSetIds.push(row.id);
        }
      }
      return { cancelledChangeSetIds };
    }),
    expirePlanChangeSet: vi.fn(async (id: string) => {
      const row = changeSets.get(id);
      if (row?.status === "pending") row.status = "expired";
    }),
    rejectPlanChangeSet: vi.fn(async (id: string) => {
      const row = changeSets.get(id);
      if (row?.status === "pending") row.status = "rejected";
    }),
    applyPlanChangeSet: vi.fn(async (id: string) => {
      await options.applyGate;
      const row = changeSets.get(id);
      if (row?.status !== "pending") throw new Error("Change set is already resolved");
      row.status = "applied";
      return { applied: 1, rejected: 0, createdTaskIds: [], externalOperationIds: [] as string[] };
    }),
    executeExternalWriteOperation: vi.fn(async () => ({ status: "succeeded" })),
    syncGitHubIntegrationAfterExternalWrite: vi.fn(async () => undefined),
    finalizeExternalWriteOperations: vi.fn(async () => ({ succeeded: 0, failed: 0, status: "applied" })),
  };
  return {
    acts,
    changeSets,
    pendingFor: (docId: string) =>
      [...changeSets.values()].filter((row) => row.docId === docId && row.status === "pending"),
  };
}

const input = { workspaceId: "ws", userId: "owner", docId: "doc-1" };

async function runWorker<T>(
  bundle: WorkflowBundleWithSourceMap,
  acts: object,
  taskQueue: string,
  fn: () => Promise<T>,
  options: { maxCachedWorkflows?: number } = {}
): Promise<T> {
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowBundle: bundle,
    activities: acts,
    ...options,
  });
  return worker.runUntil(fn());
}

async function expectCancelled(handle: WorkflowHandle) {
  const error = await handle.result().then(
    () => null,
    (err: unknown) => err
  );
  expect(error).toBeInstanceOf(WorkflowFailedError);
  expect((error as WorkflowFailedError).cause).toBeInstanceOf(CancelledFailure);
  expect((await handle.describe()).status.name).toBe("CANCELLED");
}

describe("planImpactWorkflow cancellation", () => {
  it("cancels the pending change set when cancelled during review (doc unlocked)", async () => {
    const store = planStore();
    const taskQueue = `cancel-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;

    await runWorker(currentBundle, store.acts, taskQueue, async () => {
      const handle = await env.client.workflow.start("planImpactWorkflow", {
        taskQueue,
        workflowId,
        args: [input],
      });
      await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");

      await handle.cancel();
      // Double click: a second cancel request is harmless.
      await handle.cancel().catch(() => undefined);
      await expectCancelled(handle);
    });

    expect(store.acts.cancelPlanImpactRun).toHaveBeenCalledTimes(1);
    expect(store.acts.cancelPlanImpactRun).toHaveBeenCalledWith(workflowId, "owner");
    expect(store.pendingFor("doc-1")).toEqual([]);
    expect(store.changeSets.get(`cs-${workflowId}`)?.status).toBe("cancelled");
    expect(store.acts.expirePlanChangeSet).not.toHaveBeenCalled();
    expect(store.acts.applyPlanChangeSet).not.toHaveBeenCalled();
  });

  it("does not interrupt an approved apply: the run completes and nothing stays pending", async () => {
    const gate = deferred();
    const store = planStore({ applyGate: gate.promise });
    const taskQueue = `cancel-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;

    const result = await runWorker(currentBundle, store.acts, taskQueue, async () => {
      const handle = await env.client.workflow.start("planImpactWorkflow", {
        taskQueue,
        workflowId,
        args: [input],
      });
      await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
      await handle.signal("resolvePlanChange", { decision: "approve", selectedProposalIds: ["p1"], userId: "reviewer" });
      await waitFor(() => store.acts.applyPlanChangeSet.mock.calls.length === 1, "apply start");
      await handle.cancel();
      gate.resolve();
      const output = (await handle.result()) as PlanImpactOutput;
      expect((await handle.describe()).status.name).toBe("COMPLETED");
      return output;
    });

    expect(result.decision).toBe("applied");
    expect(store.acts.cancelPlanImpactRun).not.toHaveBeenCalled();
    expect(store.changeSets.get(`cs-${workflowId}`)?.status).toBe("applied");
    expect(store.pendingFor("doc-1")).toEqual([]);
  });

  it("cleans up an execution started by the previous worker version", async () => {
    const store = planStore();
    const taskQueue = `upgrade-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;
    const handle = env.client.workflow.getHandle(workflowId);

    // Old worker persists the change set and parks on the review condition.
    // No workflow cache, so the next task is not pinned to its sticky queue.
    await runWorker(
      v0Bundle,
      store.acts,
      taskQueue,
      async () => {
        await env.client.workflow.start("planImpactWorkflow", { taskQueue, workflowId, args: [input] });
        await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
      },
      { maxCachedWorkflows: 0 }
    );

    // New worker replays the old history, then handles the cancel.
    await runWorker(currentBundle, store.acts, taskQueue, async () => {
      await handle.cancel();
      await expectCancelled(handle);
    });

    expect(store.acts.cancelPlanImpactRun).toHaveBeenCalledWith(workflowId, "owner");
    expect(store.pendingFor("doc-1")).toEqual([]);
  });

  it("still applies an approval for an execution started by the previous worker version", async () => {
    const store = planStore();
    const taskQueue = `upgrade-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;
    const handle = env.client.workflow.getHandle(workflowId);

    await runWorker(
      v0Bundle,
      store.acts,
      taskQueue,
      async () => {
        await env.client.workflow.start("planImpactWorkflow", { taskQueue, workflowId, args: [input] });
        await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
      },
      { maxCachedWorkflows: 0 }
    );

    const result = await runWorker(currentBundle, store.acts, taskQueue, async () => {
      await handle.signal("resolvePlanChange", { decision: "approve", selectedProposalIds: [], userId: "reviewer" });
      return (await handle.result()) as PlanImpactOutput;
    });

    expect(result.decision).toBe("applied");
    expect(store.changeSets.get(`cs-${workflowId}`)?.status).toBe("applied");
  });
});

describe("planImpactWorkflow replay safety", () => {
  async function historyOf(
    bundle: WorkflowBundleWithSourceMap,
    drive: (handle: WorkflowHandle, store: ReturnType<typeof planStore>) => Promise<void>
  ) {
    const store = planStore();
    const taskQueue = `replay-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;
    await runWorker(bundle, store.acts, taskQueue, async () => {
      const handle = await env.client.workflow.start("planImpactWorkflow", {
        taskQueue,
        workflowId,
        args: [input],
      });
      await drive(handle, store);
    });
    return { workflowId, history: await env.client.workflow.getHandle(workflowId).fetchHistory() };
  }

  const approve = async (handle: WorkflowHandle, store: ReturnType<typeof planStore>) => {
    await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
    await handle.signal("resolvePlanChange", { decision: "approve", selectedProposalIds: [], userId: "u" });
    await handle.result();
  };
  const reject = async (handle: WorkflowHandle, store: ReturnType<typeof planStore>) => {
    await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
    await handle.signal("resolvePlanChange", { decision: "reject", userId: "u" });
    await handle.result();
  };
  const expire = async (handle: WorkflowHandle) => {
    await handle.result();
  };
  const cancel = async (handle: WorkflowHandle, store: ReturnType<typeof planStore>) => {
    await waitFor(() => store.pendingFor("doc-1").length === 1, "pending change set");
    await handle.cancel();
    await handle.result().catch(() => undefined);
  };

  it.each([
    ["approved", approve],
    ["rejected", reject],
    ["expired", expire],
    ["cancelled (old code: no cleanup)", cancel],
  ] as const)("replays a %s history from the previous version on the current code", async (_label, drive) => {
    const { workflowId, history } = await historyOf(v0Bundle, drive);
    await expect(
      Worker.runReplayHistory({ workflowBundle: currentBundle }, history, workflowId)
    ).resolves.toBeUndefined();
  });

  it("replays its own cancellation history deterministically", async () => {
    const { workflowId, history } = await historyOf(currentBundle, cancel);
    await expect(
      Worker.runReplayHistory({ workflowBundle: currentBundle }, history, workflowId)
    ).resolves.toBeUndefined();
  });

  it("sanity: the replayer does detect a command mismatch", async () => {
    // New-code cancellation history (cleanup activity) on old code must fail;
    // proves the checks above would catch a nondeterministic change.
    const { workflowId, history } = await historyOf(currentBundle, cancel);
    await expect(
      Worker.runReplayHistory({ workflowBundle: v0Bundle }, history, workflowId)
    ).rejects.toThrow();
  });
});

// Kept last: the cancelled analysis activity completes after its workflow has
// closed, and the time-skipping test server then never releases its time lock,
// which would stall any later test that relies on skipping the 72 h timer.
describe("planImpactWorkflow cancellation during analysis", () => {
  it("cleans up when cancelled during analysis, before anything is persisted", async () => {
    const gate = deferred();
    const store = planStore({ analysisGate: gate.promise });
    const taskQueue = `cancel-${randomUUID()}`;
    const workflowId = `plan_impact-${randomUUID()}`;

    await runWorker(currentBundle, store.acts, taskQueue, async () => {
      const handle = await env.client.workflow.start("planImpactWorkflow", {
        taskQueue,
        workflowId,
        args: [input],
      });
      await waitFor(() => store.acts.analyzePlanImpact.mock.calls.length === 1, "analysis start");
      await handle.cancel();
      await expectCancelled(handle);
      gate.resolve();
    });

    expect(store.acts.persistPlanImpact).not.toHaveBeenCalled();
    expect(store.acts.cancelPlanImpactRun).toHaveBeenCalledWith(workflowId, "owner");
    expect(store.changeSets.size).toBe(0);
  });
});
