/**
 * Pure plan-history helpers: line/requirement diff and the undo planner that
 * decides which task writes restore the pre-apply state (or refuses).
 */
import { describe, expect, it } from "vitest";
import { collapseUnchanged, diffLines, diffRequirements } from "@/lib/plan-history/diff";
import { planChangeSetUndo, type UndoProposal, type UndoTaskState } from "@/lib/plan-history/undo-plan";
import { undoEligibility } from "@/lib/plan-history/eligibility";

describe("diffLines", () => {
  it("handles identical, empty and replaced text", () => {
    expect(diffLines("a\nb", "a\nb").every((line) => line.type === "equal")).toBe(true);
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("", "x")).toEqual([{ type: "added", text: "x", newNumber: 1 }]);
    expect(diffLines("a\nb\nc", "a\nB\nc").map((line) => line.type)).toEqual([
      "equal",
      "removed",
      "added",
      "equal",
    ]);
  });

  it("keeps old/new line numbers aligned around insertions", () => {
    const lines = diffLines("1\n2\n3", "1\nnew\n2\n3");
    expect(lines).toEqual([
      { type: "equal", text: "1", oldNumber: 1, newNumber: 1 },
      { type: "added", text: "new", newNumber: 2 },
      { type: "equal", text: "2", oldNumber: 2, newNumber: 3 },
      { type: "equal", text: "3", oldNumber: 3, newNumber: 4 },
    ]);
  });

  it("collapses long unchanged runs but keeps context", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "changed");
    const items = collapseUnchanged(diffLines(before, after), 2);
    expect(items[0]).toMatchObject({ type: "collapsed", count: 8, startIndex: 0 });
    expect(items.filter((item) => item.type === "collapsed")).toHaveLength(2);
  });
});

describe("diffRequirements", () => {
  const r = (stableKey: string, title: string, status = "active") => ({
    stableKey,
    title,
    description: "d",
    acceptanceCriteria: ["c"],
    status,
  });

  it("classifies added, removed, modified and unchanged requirements", () => {
    const result = diffRequirements(
      [r("REQ-1", "Same"), r("REQ-2", "Old title"), r("REQ-3", "Gone")],
      [r("REQ-1", "Same"), r("REQ-2", "New title"), r("REQ-4", "Fresh"), r("REQ-3", "Gone", "removed")]
    );
    expect(result.added).toEqual([{ stableKey: "REQ-4", title: "Fresh" }]);
    expect(result.removed).toEqual([{ stableKey: "REQ-3", title: "Gone" }]);
    expect(result.modified).toEqual([
      { stableKey: "REQ-2", fromTitle: "Old title", toTitle: "New title", fields: ["title"] },
    ]);
    expect(result.unchanged).toBe(1);
  });
});

describe("planChangeSetUndo", () => {
  const task = (overrides: Partial<UndoTaskState> = {}): UndoTaskState => ({
    id: "t-1",
    title: "New title",
    description: "New desc",
    priority: "high",
    status: "in_progress",
    isArchived: 0,
    docId: "doc-1",
    ...overrides,
  });
  const update: UndoProposal = {
    id: "cp-1",
    action: "update_task",
    status: "applied",
    taskId: "t-1",
    title: "New title",
    description: "New desc",
    priority: "high",
    metadata: {
      undoBefore: {
        title: "Old title",
        description: null,
        priority: "low",
        is_archived: 0,
        doc_id: "doc-0",
      },
    },
  };

  it("restores an updated task from its snapshot", () => {
    const plan = planChangeSetUndo([update], new Map([["t-1", task()]]));
    expect(plan).toMatchObject({
      ok: true,
      ops: [
        {
          taskId: "t-1",
          kind: "restore",
          action: "update_task",
          target: { title: "Old title", description: "", priority: "low", isArchived: 0, docId: "doc-0" },
          before: { title: "New title", is_archived: 0, doc_id: "doc-1" },
        },
      ],
    });
  });

  it("refuses when the task was edited after the change was applied", () => {
    const plan = planChangeSetUndo([update], new Map([["t-1", task({ title: "Edited by a human" })]]));
    expect(plan).toEqual({
      ok: false,
      code: "UNDO_CONFLICT",
      conflicts: [{ taskId: "t-1", title: "Edited by a human", reason: "task_edited" }],
    });
  });

  it("refuses when an updated task was deleted", () => {
    const plan = planChangeSetUndo([update], new Map());
    expect(plan).toMatchObject({ ok: false, code: "UNDO_CONFLICT", conflicts: [{ reason: "task_deleted" }] });
  });

  it("refuses legacy update proposals without a snapshot", () => {
    const plan = planChangeSetUndo([{ ...update, metadata: null }], new Map([["t-1", task()]]));
    expect(plan).toEqual({ ok: false, code: "UNDO_UNSUPPORTED", proposalIds: ["cp-1"] });
  });

  it("archives created tasks unless work has started on them", () => {
    const create: UndoProposal = {
      id: "cp-2",
      action: "create_task",
      status: "applied",
      taskId: "t-2",
      title: "Build SSO",
      description: null,
      priority: "medium",
      metadata: null,
    };
    const fresh = task({ id: "t-2", title: "Build SSO", description: "", priority: "medium", status: "todo" });
    expect(planChangeSetUndo([create], new Map([["t-2", fresh]]))).toMatchObject({
      ok: true,
      ops: [{ taskId: "t-2", kind: "archive_created", action: "archive_task", target: { isArchived: 1 } }],
    });
    expect(
      planChangeSetUndo([create], new Map([["t-2", { ...fresh, status: "done" }]]))
    ).toMatchObject({ ok: false, code: "UNDO_CONFLICT", conflicts: [{ reason: "task_in_progress" }] });
    // Already deleted: nothing to undo, not a conflict.
    expect(planChangeSetUndo([create], new Map())).toEqual({ ok: true, ops: [] });
  });

  it("restores an archived task, including legacy rows without a snapshot", () => {
    const archive: UndoProposal = { ...update, id: "cp-3", action: "archive_task", metadata: null };
    const plan = planChangeSetUndo([archive], new Map([["t-1", task({ isArchived: 1 })]]));
    expect(plan).toMatchObject({ ok: true, ops: [{ action: "restore_task", target: { isArchived: 0 } }] });
  });

  it("ignores rejected and external proposals", () => {
    const plan = planChangeSetUndo(
      [
        { ...update, status: "rejected" },
        { ...update, id: "cp-9", action: "github_create_issue", taskId: null },
      ],
      new Map([["t-1", task()]])
    );
    expect(plan).toEqual({ ok: true, ops: [] });
  });
});

describe("undoEligibility", () => {
  const base = {
    role: "owner",
    changeSetStatus: "applied",
    proposedVersionId: "v2",
    currentVersionId: "v2",
    pendingChangeSetId: null,
    revertedByChangeSetId: null,
  };
  it("allows the change set behind the current version for owners/admins", () => {
    expect(undoEligibility(base)).toEqual({ allowed: true, reason: null });
    expect(undoEligibility({ ...base, role: "admin" }).allowed).toBe(true);
  });
  it("explains every blocked state", () => {
    expect(undoEligibility({ ...base, role: "member" }).reason).toBe("FORBIDDEN");
    expect(undoEligibility({ ...base, pendingChangeSetId: "cs-p" }).reason).toBe("CHANGE_REVIEW_PENDING");
    expect(undoEligibility({ ...base, currentVersionId: "v3" }).reason).toBe("NOT_LATEST");
    expect(undoEligibility({ ...base, revertedByChangeSetId: "cs-r" }).reason).toBe("ALREADY_REVERTED");
    expect(undoEligibility({ ...base, changeSetStatus: "external_pending" }).reason).toBe("EXTERNAL_PENDING");
    expect(undoEligibility({ ...base, changeSetStatus: "rejected" }).reason).toBe("NOT_UNDOABLE");
  });
});
