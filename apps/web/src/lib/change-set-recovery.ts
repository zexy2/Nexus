/**
 * Recovery for `pending` plan change sets whose planImpactWorkflow is gone.
 *
 * The workflow owns the review: it waits for the apply/reject signal and
 * expires the change set after 72 h. If it dies after persisting the change
 * set (failure, manual terminate, lost namespace), nothing can resolve the
 * row: reject gets "workflow already completed", the expiry timer is lost,
 * and analyze-change refuses new analyses for the doc forever.
 *
 * These helpers move such change sets to a terminal state directly in the DB,
 * mirroring the rejectPlanChangeSet / expirePlanChangeSet activities.
 */
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, changeProposals, changeSets, planVersions } from "@nexus/database/schema";
import { db } from "@/lib/db";

/** Matches the `condition(..., "72 hours")` review window in planImpactWorkflow. */
export const PLAN_CHANGE_REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;
/** Slack so the workflow's own expiry timer normally wins. */
export const PLAN_CHANGE_EXPIRY_GRACE_MS = 60 * 60 * 1000;

type PlanWorkflowLiveness = "running" | "closed" | "not_found" | "unknown";

type PendingChangeSetLike = {
  id: string;
  workspaceId: string;
  status: string;
  createdAt: Date | string;
  temporalWorkflowId: string | null;
};

function changeSetIsPastReviewWindow(
  changeSet: Pick<PendingChangeSetLike, "createdAt">,
  now: Date = new Date()
) {
  const createdAt = new Date(changeSet.createdAt).getTime();
  return now.getTime() - createdAt > PLAN_CHANGE_REVIEW_WINDOW_MS + PLAN_CHANGE_EXPIRY_GRACE_MS;
}

/**
 * Decide whether a pending change set must be expired. Only "running" (or an
 * unreachable Temporal, "unknown") keeps it pending inside the review window.
 */
export function decidePendingChangeSetRecovery(
  changeSet: PendingChangeSetLike,
  liveness: PlanWorkflowLiveness,
  now: Date = new Date()
): "keep" | "expire" {
  if (changeSet.status !== "pending") return "keep";
  if (changeSetIsPastReviewWindow(changeSet, now)) return "expire";
  if (!changeSet.temporalWorkflowId) return "expire";
  if (liveness === "closed" || liveness === "not_found") return "expire";
  return "keep";
}

function isWorkflowNotFound(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return name === "WorkflowNotFoundError" || /not found/i.test(message);
}

async function getPlanWorkflowLiveness(
  workflowId: string | null
): Promise<PlanWorkflowLiveness> {
  if (!workflowId) return "not_found";
  try {
    const temporal = await import("@nexus/workflows/client");
    const status = await temporal.getWorkflowStatus(workflowId);
    return status.status === "RUNNING" ? "running" : "closed";
  } catch (error) {
    // Do not expire on a Temporal outage; only on a definitive answer.
    return isWorkflowNotFound(error) ? "not_found" : "unknown";
  }
}

/**
 * Transition a still-pending change set to `rejected` or `expired`. Returns
 * false when the row is no longer pending (someone else resolved it).
 */
export async function resolveOrphanedChangeSet(
  changeSetId: string,
  outcome: "rejected" | "expired",
  userId: string | null,
  reason: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: changeSets.id,
        workspaceId: changeSets.workspaceId,
        proposedVersionId: changeSets.proposedVersionId,
        status: changeSets.status,
      })
      .from(changeSets)
      .where(eq(changeSets.id, changeSetId))
      .for("update");
    if (!locked || locked.status !== "pending") return false;

    // Same realignment as the rejectPlanChangeSet/expirePlanChangeSet activities.
    await tx.execute(sql`
      UPDATE tasks
      SET alignment_status = CASE
            WHEN EXISTS (
              SELECT 1
              FROM requirement_task_links rtl
              INNER JOIN requirements r ON r.id = rtl.requirement_id
              INNER JOIN plan_versions pv ON pv.id = r.plan_version_id
              WHERE rtl.task_id = tasks.id
                AND pv.status = 'accepted'
            ) THEN 'aligned'
            ELSE 'orphaned'
          END,
          alignment_updated_at = now(),
          updated_at = now()
      WHERE id IN (
        SELECT task_id
        FROM change_proposals
        WHERE change_set_id = ${changeSetId}
          AND task_id IS NOT NULL
      )
    `);
    await tx
      .update(changeProposals)
      .set({ status: "rejected" })
      .where(and(eq(changeProposals.changeSetId, changeSetId), eq(changeProposals.status, "pending")));
    await tx
      .update(planVersions)
      .set({ status: outcome })
      .where(eq(planVersions.id, locked.proposedVersionId));
    await tx
      .update(changeSets)
      .set({ status: outcome, resolvedBy: userId, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(changeSets.id, changeSetId));
    await tx.insert(auditLogs).values({
      userId,
      workspaceId: locked.workspaceId,
      event: outcome === "rejected" ? "plan.change_rejected" : "plan.change_expired",
      status: "success",
      metadata: { changeSetId, recovered: true, reason },
    });
    return true;
  });
}

/**
 * If the pending change set is orphaned (workflow gone) or past its review
 * window, expire it so the doc unlocks. Returns whether it was expired.
 */
export async function expirePendingChangeSetIfOrphaned(
  changeSet: PendingChangeSetLike,
  options: { userId?: string | null; checkWorkflow?: boolean; now?: Date } = {}
): Promise<boolean> {
  if (changeSet.status !== "pending") return false;
  const now = options.now ?? new Date();
  const pastWindow = changeSetIsPastReviewWindow(changeSet, now);
  if (!pastWindow && options.checkWorkflow === false) return false;

  const liveness = pastWindow ? "unknown" : await getPlanWorkflowLiveness(changeSet.temporalWorkflowId);
  if (decidePendingChangeSetRecovery(changeSet, liveness, now) !== "expire") return false;

  try {
    return await resolveOrphanedChangeSet(
      changeSet.id,
      "expired",
      options.userId ?? null,
      pastWindow ? "review_window_elapsed" : `workflow_${liveness}`
    );
  } catch (error) {
    console.error("[ChangeSets] Orphaned change set recovery failed:", error);
    return false;
  }
}
