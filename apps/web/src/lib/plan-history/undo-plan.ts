/**
 * Pure planning step for undoing an applied plan change set.
 *
 * Given the change set's applied proposals and the tasks as they are now, it
 * works out which task writes would restore the pre-apply state. It refuses
 * (instead of guessing) when a task was edited after the change set was
 * applied, or when an old change set lacks the snapshot needed to restore it.
 */

export const INTERNAL_TASK_ACTIONS = new Set([
  "create_task",
  "update_task",
  "archive_task",
  "relink_task",
  "restore_task",
]);

/** Shape written by applyPlanChangeSet into change_proposals.metadata.undoBefore. */
export type TaskUndoSnapshot = {
  title: string;
  description: string | null;
  priority: string;
  is_archived: number;
  doc_id: string | null;
  alignment_status?: string;
};

export type UndoProposal = {
  id: string;
  action: string;
  status: string;
  taskId: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  metadata: Record<string, unknown> | null;
};

export type UndoTaskState = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  isArchived: number;
  docId: string | null;
};

export type UndoConflictReason = "task_deleted" | "task_edited" | "task_in_progress";

export type UndoConflict = { taskId: string; title: string; reason: UndoConflictReason };

export type TaskRevertOp = {
  taskId: string;
  kind: "archive_created" | "restore";
  /** How the write is recorded on the reverting change set. */
  action: "archive_task" | "restore_task" | "update_task";
  /** Values to write. */
  target: { title: string; description: string; priority: string; isArchived: number; docId: string | null };
  /** The task as it is right now, so the reverting change can itself be undone. */
  before: TaskUndoSnapshot;
  sourceProposalIds: string[];
};

export type UndoPlan =
  | { ok: true; ops: TaskRevertOp[] }
  | { ok: false; code: "UNDO_UNSUPPORTED"; proposalIds: string[] }
  | { ok: false; code: "UNDO_CONFLICT"; conflicts: UndoConflict[] };

type Fields = { title: string; description: string; priority: string; isArchived: number };

function normalizePriority(value: unknown): string {
  const priority = typeof value === "string" ? value.toLowerCase() : "medium";
  return ["low", "medium", "high", "urgent"].includes(priority) ? priority : "medium";
}

function readSnapshot(metadata: Record<string, unknown> | null): TaskUndoSnapshot | null {
  const value = metadata?.undoBefore;
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.title !== "string" || typeof snapshot.priority !== "string") return null;
  return {
    title: snapshot.title,
    description: typeof snapshot.description === "string" ? snapshot.description : null,
    priority: snapshot.priority,
    is_archived: Number(snapshot.is_archived) === 1 ? 1 : 0,
    doc_id: typeof snapshot.doc_id === "string" ? snapshot.doc_id : null,
  };
}

function fieldsOf(task: UndoTaskState): Fields {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    isArchived: task.isArchived === 1 ? 1 : 0,
  };
}

function sameFields(a: Fields, b: Fields) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.priority === b.priority &&
    a.isArchived === b.isArchived
  );
}

/** Mirrors what applyPlanChangeSet writes for one internal proposal. */
function applyProposal(state: Fields, proposal: UndoProposal): Fields {
  switch (proposal.action) {
    case "update_task": {
      const hasPriority = typeof proposal.priority === "string" && proposal.priority.trim().length > 0;
      return {
        title: proposal.title.trim() ? proposal.title : state.title,
        description: proposal.description ?? state.description,
        priority: hasPriority ? normalizePriority(proposal.priority) : state.priority,
        isArchived: 0,
      };
    }
    case "archive_task":
      return { ...state, isArchived: 1 };
    case "restore_task":
      return { ...state, isArchived: 0 };
    default:
      return state;
  }
}

export function planChangeSetUndo(
  proposals: UndoProposal[],
  tasks: Map<string, UndoTaskState>
): UndoPlan {
  const applied = proposals.filter(
    (proposal) =>
      proposal.status === "applied" && INTERNAL_TASK_ACTIONS.has(proposal.action) && proposal.taskId
  );

  const byTask = new Map<string, UndoProposal[]>();
  for (const proposal of applied) {
    const list = byTask.get(proposal.taskId!) ?? [];
    list.push(proposal);
    byTask.set(proposal.taskId!, list);
  }

  // Old change sets (applied before snapshots existed) cannot restore the
  // previous title/description/priority of an updated task.
  const unsupported = applied.filter((proposal) => {
    if (proposal.action !== "update_task") return false;
    const first = byTask.get(proposal.taskId!)![0]!;
    return first.action !== "create_task" && !readSnapshot(first.metadata);
  });
  if (unsupported.length > 0) {
    return { ok: false, code: "UNDO_UNSUPPORTED", proposalIds: unsupported.map((item) => item.id) };
  }

  const ops: TaskRevertOp[] = [];
  const conflicts: UndoConflict[] = [];

  for (const [taskId, list] of byTask) {
    const task = tasks.get(taskId);
    const first = list[0]!;
    const created = first.action === "create_task";

    if (!task) {
      // A task this change set created and someone already deleted: nothing to undo.
      if (!created) conflicts.push({ taskId, title: first.title, reason: "task_deleted" });
      continue;
    }

    const current = fieldsOf(task);
    let initial: Fields;
    let initialDocId: string | null = task.docId;
    if (created) {
      initial = {
        title: first.title,
        description: first.description ?? "",
        priority: normalizePriority(first.priority),
        isArchived: 0,
      };
    } else {
      const snapshot = readSnapshot(first.metadata);
      if (snapshot) {
        initial = {
          title: snapshot.title,
          description: snapshot.description ?? "",
          priority: snapshot.priority,
          isArchived: snapshot.is_archived,
        };
        initialDocId = snapshot.doc_id;
      } else {
        // Legacy archive/restore/relink: only the archive flag is known.
        initial = {
          ...current,
          isArchived:
            first.action === "archive_task" ? 0 : first.action === "restore_task" ? 1 : current.isArchived,
        };
      }
    }

    const expected = list.slice(created ? 1 : 0).reduce(applyProposal, initial);
    if (!sameFields(expected, current)) {
      conflicts.push({ taskId, title: task.title, reason: "task_edited" });
      continue;
    }
    if (created && task.status !== "todo") {
      conflicts.push({ taskId, title: task.title, reason: "task_in_progress" });
      continue;
    }

    const target = created
      ? { ...current, isArchived: 1, docId: task.docId }
      : { ...initial, docId: initialDocId };
    if (sameFields(target, current) && target.docId === task.docId) continue;

    const onlyArchiveFlag =
      target.title === current.title &&
      target.description === current.description &&
      target.priority === current.priority;
    ops.push({
      taskId,
      kind: created ? "archive_created" : "restore",
      action:
        created || (onlyArchiveFlag && target.isArchived === 1)
          ? "archive_task"
          : onlyArchiveFlag && target.isArchived === 0
            ? "restore_task"
            : "update_task",
      target,
      before: {
        title: task.title,
        description: task.description,
        priority: task.priority,
        is_archived: current.isArchived,
        doc_id: task.docId,
      },
      sourceProposalIds: list.map((item) => item.id),
    });
  }

  if (conflicts.length > 0) return { ok: false, code: "UNDO_CONFLICT", conflicts };
  return { ok: true, ops };
}
