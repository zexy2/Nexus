/**
 * Workflow tests on the Temporal time-skipping test server with mocked
 * activities. Exercises the real workflow code through the worker bundle, so
 * determinism, signal handling and timers behave as in production.
 */
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ApplicationFailure, WorkflowFailedError } from "@temporalio/client";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { bundleWorkflowCode, Runtime, DefaultLogger, Worker, type WorkflowBundleWithSourceMap } from "@temporalio/worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as activities from "../activities";
import {
  applyPlanChangeSetWorkflow,
  codeGenerationWorkflow,
  documentGenerationWorkflow,
  externalWriteRetryWorkflow,
  planImpactWorkflow,
  researchWorkflow,
  resolvePlanChangeSignal,
  runExternalWriteOperationsWorkflow,
  taskBreakdownWorkflow,
  WORKFLOW_PARSE_ERROR_TYPE,
} from "../workflows";
import type { AgentStepResult } from "../types";

type Activities = typeof activities;
type MockActivities = Partial<{ [K in keyof Activities]: Activities[K] }>;

let env: TestWorkflowEnvironment;
let workflowBundle: WorkflowBundleWithSourceMap;

beforeAll(async () => {
  Runtime.install({ logger: new DefaultLogger("ERROR") });
  env = await TestWorkflowEnvironment.createTimeSkipping();
  workflowBundle = await bundleWorkflowCode({
    workflowsPath: fileURLToPath(new URL("../workflows.ts", import.meta.url)),
    logger: new DefaultLogger("ERROR"),
  });
});

afterAll(async () => {
  await env?.teardown();
});

function step(agentName: string, output: string): AgentStepResult {
  return { agentName, input: "in", output, success: true, duration: 1 };
}

async function withWorker<T>(acts: MockActivities, fn: (taskQueue: string) => Promise<T>): Promise<T> {
  const taskQueue = `test-${randomUUID()}`;
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowBundle,
    activities: acts,
  });
  return worker.runUntil(fn(taskQueue));
}

const persisted = {
  changeSetId: "cs-1",
  versionNumber: 3,
  summary: "2 proposals",
  stats: { proposals: 2 },
  steps: [step("plan-impact", "analysis")],
};

function planActivities(overrides: MockActivities = {}) {
  return {
    analyzePlanImpact: vi.fn(async () => ({ analysis: true })),
    persistPlanImpact: vi.fn(async () => persisted),
    expirePlanChangeSet: vi.fn(async () => undefined),
    rejectPlanChangeSet: vi.fn(async () => undefined),
    applyPlanChangeSet: vi.fn(async () => ({
      applied: 2,
      rejected: 0,
      createdTaskIds: ["t1"],
      externalOperationIds: [] as string[],
    })),
    executeExternalWriteOperation: vi.fn(async () => ({ status: "succeeded" })),
    syncGitHubIntegrationAfterExternalWrite: vi.fn(async () => undefined),
    finalizeExternalWriteOperations: vi.fn(async () => ({
      succeeded: 1,
      failed: 0,
      status: "applied" as const,
    })),
    ...overrides,
  } as unknown as MockActivities & Record<string, ReturnType<typeof vi.fn>>;
}

describe("documentGenerationWorkflow", () => {
  it("researches, writes, saves and notifies", async () => {
    const acts = {
      sendNotification: vi.fn(async () => undefined),
      callResearchAgent: vi.fn(async () => ({ ...step("research", "facts"), sources: [] })),
      callWriterAgent: vi.fn(async (_prompt: string, _context?: string) => step("writer", "# Doc")),
      saveDocument: vi.fn(async () => "doc-1"),
    };

    const result = await withWorker(acts as unknown as MockActivities, (taskQueue) =>
      env.client.workflow.execute(documentGenerationWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ workspaceId: "ws", userId: "u1", title: "T", prompt: "About X", style: "technical" }],
      })
    );

    expect(result).toMatchObject({ documentId: "doc-1", title: "T", content: "# Doc" });
    expect(result.steps.map((s) => s.agentName)).toEqual(["research", "writer"]);
    expect(acts.saveDocument).toHaveBeenCalledWith("ws", "T", "# Doc", "u1");
    expect(acts.callWriterAgent.mock.calls[0]?.[0]).toContain("technical");
    expect(acts.sendNotification).toHaveBeenLastCalledWith("u1", expect.stringContaining("T"), "success");
  });
});

describe("researchWorkflow", () => {
  it("merges document and agent sources and runs a deep pass after a timer", async () => {
    const acts = {
      sendNotification: vi.fn(async () => undefined),
      searchDocuments: vi.fn(async () => [{ id: "d1", title: "Doc 1", content: "x".repeat(500), similarity: 0.9 }]),
      callResearchAgent: vi
        .fn()
        .mockResolvedValueOnce({ ...step("research", "summary"), sources: [{ title: "Web", snippet: "s", relevance: 0.5 }] })
        .mockResolvedValueOnce({ ...step("research", "deeper"), sources: [] }),
    };

    const result = await withWorker(acts as unknown as MockActivities, (taskQueue) =>
      env.client.workflow.execute(researchWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ workspaceId: "ws", userId: "u1", query: "q", depth: "deep" }],
      })
    );

    expect(result.summary).toBe("summary");
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]?.snippet).toHaveLength(320);
    expect(result.steps).toHaveLength(2);
    expect(acts.callResearchAgent).toHaveBeenCalledTimes(2);
  });
});

describe("taskBreakdownWorkflow", () => {
  it("parses agent JSON and saves tasks with persisted ids", async () => {
    const acts = {
      sendNotification: vi.fn(async () => undefined),
      callTaskAgent: vi.fn(async () =>
        step("task", '```json\n[{"title":"A","priority":"HIGH"},{"title":"B","estimatedHours":2}]\n```')
      ),
      saveTasks: vi.fn(async () => ["task-a"]),
    };

    const result = await withWorker(acts as unknown as MockActivities, (taskQueue) =>
      env.client.workflow.execute(taskBreakdownWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ workspaceId: "ws", userId: "u1", projectDescription: "Build it", docId: "doc-9" }],
      })
    );

    expect(result.tasks.map((t) => [t.id, t.title, t.priority, t.estimatedHours])).toEqual([
      ["task-a", "A", "high", 4],
      ["pending-task-2", "B", "medium", 2],
    ]);
    expect(acts.saveTasks).toHaveBeenCalledWith("ws", expect.any(Array), "u1", "doc-9");
  });

  it("fails the workflow (not the task) with a non-retryable parse failure", async () => {
    const acts = {
      sendNotification: vi.fn(async () => undefined),
      callTaskAgent: vi.fn(async () => step("task", "Sorry, I cannot help with that.")),
      saveTasks: vi.fn(async () => []),
    };

    const error = await withWorker(acts as unknown as MockActivities, (taskQueue) =>
      env.client.workflow
        .execute(taskBreakdownWorkflow, {
          taskQueue,
          workflowId: randomUUID(),
          args: [{ workspaceId: "ws", userId: "u1", projectDescription: "Build it" }],
        })
        .then(
          () => null,
          (err: unknown) => err
        )
    );

    expect(error).toBeInstanceOf(WorkflowFailedError);
    const cause = (error as WorkflowFailedError).cause;
    expect(cause).toBeInstanceOf(ApplicationFailure);
    expect((cause as ApplicationFailure).type).toBe(WORKFLOW_PARSE_ERROR_TYPE);
    expect((cause as ApplicationFailure).nonRetryable).toBe(true);
    expect(acts.saveTasks).not.toHaveBeenCalled();
  });
});

describe("codeGenerationWorkflow", () => {
  it("generates main and test files with the language extension", async () => {
    const acts = {
      sendNotification: vi.fn(async () => undefined),
      callResearchAgent: vi.fn(async () => ({ ...step("research", "bp"), sources: [] })),
      callCoderAgent: vi.fn(async (spec: string) => step("coder", spec.startsWith("Write tests") ? "tests" : "code")),
    };

    const result = await withWorker(acts as unknown as MockActivities, (taskQueue) =>
      env.client.workflow.execute(codeGenerationWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ workspaceId: "ws", userId: "u1", specification: "spec", language: "Python", includeTests: true }],
      })
    );

    expect(result.files.map((f) => [f.path, f.content])).toEqual([
      ["src/main.py", "code"],
      ["tests/main.test.py", "tests"],
    ]);
    expect(result.steps).toHaveLength(3);
  });
});

describe("planImpactWorkflow", () => {
  const input = { workspaceId: "ws", userId: "owner", docId: "doc-1" };

  it("expires the change set when nobody decides within 72 hours", async () => {
    const acts = planActivities();
    const startedAt = Date.now();
    const before = await env.currentTimeMs();

    const result = await withWorker(acts, (taskQueue) =>
      env.client.workflow.execute(planImpactWorkflow, { taskQueue, workflowId: randomUUID(), args: [input] })
    );

    expect(result.decision).toBe("expired");
    expect(result.changeSetId).toBe("cs-1");
    expect(acts.expirePlanChangeSet).toHaveBeenCalledWith("cs-1", "owner");
    expect(acts.applyPlanChangeSet).not.toHaveBeenCalled();
    // The 72h timer was skipped, not waited for.
    expect((await env.currentTimeMs()) - before).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000);
    expect(Date.now() - startedAt).toBeLessThan(30_000);
  });

  it("rejects when the reject signal arrives", async () => {
    const acts = planActivities();

    const result = await withWorker(acts, async (taskQueue) => {
      const handle = await env.client.workflow.start(planImpactWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [input],
      });
      await handle.signal(resolvePlanChangeSignal, { decision: "reject", userId: "reviewer" });
      return handle.result();
    });

    expect(result.decision).toBe("rejected");
    expect(acts.rejectPlanChangeSet).toHaveBeenCalledWith("cs-1", "reviewer");
    expect(acts.expirePlanChangeSet).not.toHaveBeenCalled();
  });

  it("applies selected proposals and runs external writes on approval", async () => {
    const acts = planActivities({
      applyPlanChangeSet: vi.fn(async () => ({
        applied: 1,
        rejected: 1,
        createdTaskIds: [],
        externalOperationIds: ["op-ok", "op-fail", "op-pending"],
      })),
      executeExternalWriteOperation: vi.fn(async (id: string) => {
        if (id === "op-fail") throw ApplicationFailure.nonRetryable("boom", "ExternalWriteTerminalError");
        return { status: id === "op-ok" ? "succeeded" : "failed" };
      }) as unknown as Activities["executeExternalWriteOperation"],
    });

    const result = await withWorker(acts, async (taskQueue) => {
      const handle = await env.client.workflow.start(planImpactWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [input],
      });
      await handle.signal(resolvePlanChangeSignal, {
        decision: "approve",
        selectedProposalIds: ["p1"],
        userId: "reviewer",
      });
      return handle.result();
    });

    expect(result.decision).toBe("applied");
    expect(result.applied?.external).toEqual({ succeeded: 1, failed: 0, status: "applied" });
    expect(acts.applyPlanChangeSet).toHaveBeenCalledWith("cs-1", ["p1"], "reviewer");
    expect(acts.executeExternalWriteOperation).toHaveBeenCalledTimes(3);
    // Only the succeeded operation triggers a GitHub sync.
    expect(acts.syncGitHubIntegrationAfterExternalWrite).toHaveBeenCalledTimes(1);
    expect(acts.syncGitHubIntegrationAfterExternalWrite).toHaveBeenCalledWith("op-ok");
    expect(acts.finalizeExternalWriteOperations).toHaveBeenCalledWith("cs-1", "reviewer");
  });
});

describe("external write workflows", () => {
  it("applyPlanChangeSetWorkflow skips finalize when there are no external operations", async () => {
    const acts = planActivities();
    const result = await withWorker(acts, (taskQueue) =>
      env.client.workflow.execute(applyPlanChangeSetWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ changeSetId: "cs-2", selectedProposalIds: ["p"], userId: "u" }],
      })
    );
    expect(result).toMatchObject({ changeSetId: "cs-2", decision: "applied", applied: { external: null } });
    expect(acts.finalizeExternalWriteOperations).not.toHaveBeenCalled();
  });

  it("externalWriteRetryWorkflow finalizes even when the operation fails terminally", async () => {
    const acts = planActivities({
      executeExternalWriteOperation: vi.fn(async () => {
        throw ApplicationFailure.nonRetryable("gone", "ExternalWriteTerminalError");
      }) as unknown as Activities["executeExternalWriteOperation"],
    });
    const result = await withWorker(acts, (taskQueue) =>
      env.client.workflow.execute(externalWriteRetryWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ operationId: "op", changeSetId: "cs-3", userId: "u" }],
      })
    );
    expect(result).toEqual({ succeeded: 1, failed: 0, status: "applied" });
    expect(acts.executeExternalWriteOperation).toHaveBeenCalledTimes(1);
    expect(acts.finalizeExternalWriteOperations).toHaveBeenCalledWith("cs-3", "u");
  });

  it("runExternalWriteOperationsWorkflow drains every runnable operation", async () => {
    const acts = planActivities({
      listRunnableExternalWriteOperationIds: vi.fn(async () => ["a", "b"]),
    });
    await withWorker(acts, (taskQueue) =>
      env.client.workflow.execute(runExternalWriteOperationsWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [{ changeSetId: "cs-4", userId: "u" }],
      })
    );
    expect(acts.executeExternalWriteOperation).toHaveBeenCalledTimes(2);
    expect(acts.syncGitHubIntegrationAfterExternalWrite).toHaveBeenCalledTimes(2);
    expect(acts.finalizeExternalWriteOperations).toHaveBeenCalledWith("cs-4", "u");
  });
});
