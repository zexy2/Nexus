/**
 * Regression tests for the plan-change activity logic.
 *
 * These tests mock the postgres client at the tagged-template level so the
 * activity transaction can be exercised without a database.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall = {
  text: string;
  values: unknown[];
};

type ProposalRow = {
  id: string;
  requirement_id: string | null;
  task_id: string | null;
  action: "create_task" | "update_task" | "archive_task" | "relink_task";
  title: string;
  description: string | null;
  priority: string | null;
  rationale: string;
};

const mockState = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  proposals: [] as ProposalRow[],
  changeSet: {
    id: "cs-1",
    workspace_id: "ws-1",
    doc_id: "doc-1",
    proposed_version_id: "pv-2",
    status: "pending",
  },
  insertedTaskId: "task-created",
  end: vi.fn(),
  postgres: vi.fn(),
}));

function makeSqlClient() {
  const sql = Object.assign(
    async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const text = strings.join("?");
      mockState.calls.push({ text, values });

      if (text.includes("FROM change_sets")) {
        return [mockState.changeSet] as T;
      }

      if (text.includes("FROM change_proposals")) {
        return mockState.proposals as T;
      }

      if (text.includes("INSERT INTO tasks")) {
        return [{ id: mockState.insertedTaskId }] as T;
      }

      return [] as T;
    },
    {
      begin: async <T>(callback: (transaction: typeof sql) => Promise<T>) => callback(sql),
      end: mockState.end,
    }
  );

  return sql;
}

vi.mock("postgres", () => ({
  default: mockState.postgres,
}));

import {
  applyPlanChangeSet,
  externalErrorIsRetryable,
  externalWriteOperationNeedsWork,
  resolveExternalChangeSetStatus,
} from "../../../../../packages/workflows/src/activities";

describe("external write policy", () => {
  it("retries timeouts, rate limits, server errors, and network failures", () => {
    expect(externalErrorIsRetryable(Object.assign(new Error("timeout"), { status: 408 }))).toBe(true);
    expect(externalErrorIsRetryable(Object.assign(new Error("limited"), { status: 429 }))).toBe(true);
    expect(externalErrorIsRetryable(Object.assign(new Error("provider"), { status: 503 }))).toBe(true);
    expect(externalErrorIsRetryable(new Error("network"))).toBe(true);
  });

  it("does not retry provider validation or permission errors", () => {
    expect(externalErrorIsRetryable(Object.assign(new Error("invalid"), { status: 400 }))).toBe(false);
    expect(externalErrorIsRetryable(Object.assign(new Error("forbidden"), { status: 403 }))).toBe(false);
    expect(externalErrorIsRetryable(new Error("GitHub installation is missing"))).toBe(false);
    expect(externalErrorIsRetryable(new Error("GitHub issue create requires payload.title"))).toBe(false);
    expect(externalErrorIsRetryable(new Error("Unsupported external provider: github"))).toBe(false);
  });

  it("calculates truthful terminal change-set states", () => {
    expect(resolveExternalChangeSetStatus({ succeeded: 2, failed: 0, internalApplied: 1 })).toBe("applied");
    expect(resolveExternalChangeSetStatus({ succeeded: 1, failed: 1, internalApplied: 0 })).toBe("partially_applied");
    expect(resolveExternalChangeSetStatus({ succeeded: 0, failed: 1, internalApplied: 2 })).toBe("partially_applied");
    expect(resolveExternalChangeSetStatus({ succeeded: 0, failed: 2, internalApplied: 0 })).toBe("external_failed");
  });

  it("reruns pending sync after provider write already succeeded", () => {
    expect(externalWriteOperationNeedsWork({ status: "succeeded", syncStatus: "pending" })).toBe(true);
    expect(externalWriteOperationNeedsWork({ status: "succeeded", syncStatus: "running" })).toBe(true);
    expect(externalWriteOperationNeedsWork({ status: "succeeded", syncStatus: "succeeded" })).toBe(false);
    expect(externalWriteOperationNeedsWork({ status: "failed_retryable", syncStatus: "not_required" })).toBe(true);
  });
});

describe("applyPlanChangeSet", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://nexus-test";
    mockState.calls.length = 0;
    mockState.proposals = [];
    mockState.changeSet = {
      id: "cs-1",
      workspace_id: "ws-1",
      doc_id: "doc-1",
      proposed_version_id: "pv-2",
      status: "pending",
    };
    mockState.insertedTaskId = "task-created";
    mockState.end.mockClear();
    mockState.postgres.mockClear();
    mockState.postgres.mockImplementation(() => makeSqlClient());
  });

  it("rejects an empty selection before opening a postgres client", async () => {
    await expect(applyPlanChangeSet("cs-1", [], "user-1")).rejects.toThrow(
      "No change proposals selected"
    );

    expect(mockState.postgres).not.toHaveBeenCalled();
    expect(mockState.calls).toHaveLength(0);
  });

  it("rejects selected proposal ids that are not pending in the change set", async () => {
    mockState.proposals = [
      {
        id: "cp-1",
        requirement_id: "req-1",
        task_id: "task-1",
        action: "update_task",
        title: "Update task",
        description: null,
        priority: null,
        rationale: "Keep task aligned",
      },
    ];

    await expect(applyPlanChangeSet("cs-1", ["cp-1", "other"], "user-1")).rejects.toThrow(
      "Selected proposal does not belong to this pending change set"
    );

    expect(mockState.end).toHaveBeenCalledTimes(1);
  });

  it("marks the change set as partially_applied when only some proposals are selected", async () => {
    mockState.proposals = [
      {
        id: "cp-1",
        requirement_id: "req-1",
        task_id: "task-1",
        action: "update_task",
        title: "Updated task title",
        description: null,
        priority: null,
        rationale: "Requirement changed",
      },
      {
        id: "cp-2",
        requirement_id: "req-2",
        task_id: null,
        action: "create_task",
        title: "Create skipped task",
        description: "Skipped",
        priority: "high",
        rationale: "New requirement",
      },
    ];

    const result = await applyPlanChangeSet("cs-1", ["cp-1"], "user-1");

    expect(result).toEqual({
      applied: 1,
      rejected: 1,
      createdTaskIds: [],
      externalOperationIds: [],
    });
    expect(mockState.calls.some((call) => call.text.includes("UPDATE change_proposals SET status = 'rejected'"))).toBe(true);

    const changeSetUpdate = mockState.calls.find((call) => call.text.includes("UPDATE change_sets"));
    expect(changeSetUpdate?.values).toContain("partially_applied");

    const taskUpdate = mockState.calls.find((call) => call.text.includes("description = COALESCE"));
    expect(taskUpdate?.text).toContain("ELSE priority");
    expect(taskUpdate?.values).toContain(false);
    expect(taskUpdate?.values).toContain(null);
  });

  it("performs a true relink and records a fully applied change set", async () => {
    mockState.proposals = [
      {
        id: "cp-1",
        requirement_id: "req-new",
        task_id: "task-1",
        action: "relink_task",
        title: "Relink task",
        description: null,
        priority: null,
        rationale: "Task belongs to the updated requirement",
      },
    ];

    const result = await applyPlanChangeSet("cs-1", ["cp-1"], "user-1");

    expect(result).toEqual({
      applied: 1,
      rejected: 0,
      createdTaskIds: [],
      externalOperationIds: [],
    });
    expect(mockState.calls.some((call) => call.text.includes("DELETE FROM requirement_task_links"))).toBe(true);

    const changeSetUpdate = mockState.calls.find((call) => call.text.includes("UPDATE change_sets"));
    expect(changeSetUpdate?.values).toContain("applied");
  });
});
