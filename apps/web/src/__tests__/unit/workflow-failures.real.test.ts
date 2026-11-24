/**
 * Errors raised by workflow code must fail the workflow, not the workflow
 * task. A plain Error makes Temporal retry the workflow task forever (the
 * execution looks RUNNING indefinitely); ApplicationFailure fails it cleanly.
 *
 * The workflow sandbox APIs are mocked so the workflow function can run in
 * plain Node; ApplicationFailure stays the real class.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const activityMocks = vi.hoisted(() => ({
  callTaskAgent: vi.fn(),
  saveTasks: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("../../../../../packages/workflows/node_modules/@temporalio/workflow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../packages/workflows/node_modules/@temporalio/workflow")>();
  return {
    ApplicationFailure: actual.ApplicationFailure,
    condition: vi.fn(),
    defineSignal: (name: string) => ({ name, type: "signal" }),
    proxyActivities: () =>
      new Proxy({}, {
        get: (_target, name: string) =>
          (activityMocks as Record<string, unknown>)[name] ?? vi.fn(),
      }),
    setHandler: vi.fn(),
    sleep: vi.fn(),
    workflowInfo: () => ({ workflowId: "wf-1" }),
  };
});

import { ApplicationFailure } from "../../../../../packages/workflows/node_modules/@temporalio/workflow";
import {
  WORKFLOW_PARSE_ERROR_TYPE,
  parseTaskBreakdown,
  taskBreakdownWorkflow,
} from "../../../../../packages/workflows/src/workflows";

type TaskBreakdownInput = Parameters<typeof taskBreakdownWorkflow>[0];

const input = {
  workspaceId: "ws-1",
  userId: "user-1",
  projectDescription: "Build it",
} as TaskBreakdownInput;

beforeEach(() => {
  vi.clearAllMocks();
  activityMocks.sendNotification.mockResolvedValue(undefined);
  activityMocks.saveTasks.mockResolvedValue(["task-1"]);
});

describe("parse error -> workflow fails non-retryable", () => {
  it("parseTaskBreakdown throws a non-retryable ApplicationFailure for unparseable output", () => {
    let thrown: unknown;
    try {
      parseTaskBreakdown("I could not think of any tasks, sorry.");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApplicationFailure);
    expect(thrown).toMatchObject({
      nonRetryable: true,
      type: WORKFLOW_PARSE_ERROR_TYPE,
      message: "Task agent did not return parseable tasks",
    });
  });

  it("rejects invalid task items with a non-retryable ApplicationFailure", () => {
    expect(() => parseTaskBreakdown('[1, {"title": "ok"}]')).toThrow(ApplicationFailure);
  });

  it("taskBreakdownWorkflow fails with ApplicationFailure (fails the workflow, not the task) and saves nothing", async () => {
    activityMocks.callTaskAgent.mockResolvedValue({
      agentName: "task",
      output: "No list here.",
      tokensUsed: 1,
      durationMs: 1,
    });

    const error = await taskBreakdownWorkflow(input).catch((caught) => caught);

    expect(error).toBeInstanceOf(ApplicationFailure);
    expect(error.nonRetryable).toBe(true);
    expect(activityMocks.saveTasks).not.toHaveBeenCalled();
  });

  it("still parses well-formed output", async () => {
    activityMocks.callTaskAgent.mockResolvedValue({
      agentName: "task",
      output: '```json\n[{"title":"Write docs","priority":"high"}]\n```',
      tokensUsed: 1,
      durationMs: 1,
    });

    const result = await taskBreakdownWorkflow(input);

    expect(result.tasks).toEqual([
      expect.objectContaining({ id: "task-1", title: "Write docs", priority: "high" }),
    ]);
  });
});
