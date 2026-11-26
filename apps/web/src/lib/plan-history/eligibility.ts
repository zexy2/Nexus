/** Pure "can this change set be undone right now?" check for the history list. */

export const UNDOABLE_STATUSES = new Set(["applied", "partially_applied", "external_failed"]);

export type UndoBlockReason =
  | "FORBIDDEN"
  | "CHANGE_REVIEW_PENDING"
  | "NOT_UNDOABLE"
  | "EXTERNAL_PENDING"
  | "ALREADY_REVERTED"
  | "NOT_LATEST";

export function canUndoRole(role: string) {
  return role === "owner" || role === "admin";
}

export function undoEligibility(input: {
  role: string;
  changeSetStatus: string;
  proposedVersionId: string;
  currentVersionId: string | null;
  pendingChangeSetId: string | null;
  revertedByChangeSetId: string | null;
}): { allowed: boolean; reason: UndoBlockReason | null } {
  const block = (reason: UndoBlockReason) => ({ allowed: false, reason });
  if (input.changeSetStatus === "external_pending") return block("EXTERNAL_PENDING");
  if (!UNDOABLE_STATUSES.has(input.changeSetStatus)) return block("NOT_UNDOABLE");
  if (input.revertedByChangeSetId) return block("ALREADY_REVERTED");
  if (input.currentVersionId !== input.proposedVersionId) return block("NOT_LATEST");
  if (input.pendingChangeSetId) return block("CHANGE_REVIEW_PENDING");
  if (!canUndoRole(input.role)) return block("FORBIDDEN");
  return { allowed: true, reason: null };
}
