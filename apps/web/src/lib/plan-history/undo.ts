/**
 * Undo an applied Living Plan change set by writing a *reverting* change set.
 *
 * Nothing is deleted: the reverting change set is a new, already-applied row
 * (reverts_change_set_id -> the original) whose proposed version is a new plan
 * version carrying the content and requirements of the version the original
 * change set started from. Task writes made by the original change set are
 * restored from the snapshots applyPlanChangeSet stored, and recorded as
 * applied proposals of the reverting change set (so it can be undone too).
 *
 * External writes already pushed to GitHub/Linear are never reverted; their
 * count is returned so the UI can say so.
 *
 * Runs in the web app (not a Temporal workflow) so no workflow history is
 * touched. Every check is repeated inside one transaction under a per-plan
 * advisory lock, so concurrent undo/undo or undo/review races cannot both win.
 */
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import {
  changeProposals,
  changeSets,
  externalWriteOperations,
  planVersions,
  requirements,
  requirementTaskLinks,
  tasks,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import { diffRequirements } from "./diff";
import { UNDOABLE_STATUSES } from "./eligibility";
import { planChangeSetUndo, type UndoConflict, type UndoTaskState } from "./undo-plan";


export type UndoChangeSetResult =
  | {
      ok: true;
      changeSetId: string;
      versionId: string;
      versionNumber: number;
      restoredVersionNumber: number | null;
      revertedTasks: number;
      externalNotReverted: number;
    }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "CHANGE_REVIEW_PENDING"; changeSetId: string }
  | { ok: false; code: "NOT_UNDOABLE"; status: string }
  | { ok: false; code: "ALREADY_REVERTED"; revertChangeSetId: string }
  | { ok: false; code: "NOT_LATEST" }
  | { ok: false; code: "UNDO_UNSUPPORTED"; proposalIds: string[] }
  | { ok: false; code: "UNDO_CONFLICT"; conflicts: UndoConflict[] };

type TaskPriority = (typeof tasks.$inferInsert)["priority"];

export async function undoChangeSet(input: {
  changeSetId: string;
  userId: string;
}): Promise<UndoChangeSetResult> {
  return db.transaction(async (tx) => {
    const [changeSet] = await tx
      .select()
      .from(changeSets)
      .where(eq(changeSets.id, input.changeSetId))
      .for("update");
    if (!changeSet) return { ok: false, code: "NOT_FOUND" } as const;

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`plan-history:${changeSet.docId}`}))`
    );

    const [pending] = await tx
      .select({ id: changeSets.id })
      .from(changeSets)
      .where(and(eq(changeSets.docId, changeSet.docId), eq(changeSets.status, "pending")))
      .limit(1);
    if (pending) return { ok: false, code: "CHANGE_REVIEW_PENDING", changeSetId: pending.id } as const;

    if (!UNDOABLE_STATUSES.has(changeSet.status)) {
      return { ok: false, code: "NOT_UNDOABLE", status: changeSet.status } as const;
    }

    const [existingRevert] = await tx
      .select({ id: changeSets.id })
      .from(changeSets)
      .where(eq(changeSets.revertsChangeSetId, changeSet.id))
      .limit(1);
    if (existingRevert) {
      return { ok: false, code: "ALREADY_REVERTED", revertChangeSetId: existingRevert.id } as const;
    }

    const [current] = await tx
      .select()
      .from(planVersions)
      .where(and(eq(planVersions.docId, changeSet.docId), eq(planVersions.status, "accepted")))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1)
      .for("update");
    // Only the change set that produced the current baseline can be undone;
    // undoing an older one would silently drop every later change.
    if (!current || current.id !== changeSet.proposedVersionId) {
      return { ok: false, code: "NOT_LATEST" } as const;
    }

    const proposals = await tx
      .select()
      .from(changeProposals)
      .where(eq(changeProposals.changeSetId, changeSet.id))
      .orderBy(asc(changeProposals.createdAt), asc(changeProposals.id));

    const taskIds = Array.from(
      new Set(proposals.map((proposal) => proposal.taskId).filter((id): id is string => Boolean(id)))
    );
    const taskRows = taskIds.length
      ? await tx
          .select({
            id: tasks.id,
            title: tasks.title,
            description: tasks.description,
            priority: tasks.priority,
            status: tasks.status,
            isArchived: tasks.isArchived,
            docId: tasks.docId,
          })
          .from(tasks)
          .where(and(inArray(tasks.id, taskIds), eq(tasks.workspaceId, changeSet.workspaceId)))
          .for("update")
      : [];
    const taskMap = new Map<string, UndoTaskState>(taskRows.map((row) => [row.id, row]));

    const plan = planChangeSetUndo(
      proposals.map((proposal) => ({
        id: proposal.id,
        action: proposal.action,
        status: proposal.status,
        taskId: proposal.taskId,
        title: proposal.title,
        description: proposal.description,
        priority: proposal.priority,
        metadata: proposal.metadata ?? null,
      })),
      taskMap
    );
    if (!plan.ok) return plan;

    const base = changeSet.baseVersionId
      ? await tx.query.planVersions.findFirst({ where: eq(planVersions.id, changeSet.baseVersionId) })
      : undefined;

    const [{ maxVersion } = { maxVersion: 0 }] = await tx
      .select({ maxVersion: max(planVersions.versionNumber) })
      .from(planVersions)
      .where(eq(planVersions.docId, changeSet.docId));
    const versionNumber = (maxVersion ?? 0) + 1;

    const [version] = await tx
      .insert(planVersions)
      .values({
        workspaceId: changeSet.workspaceId,
        docId: changeSet.docId,
        versionNumber,
        title: base?.title ?? current.title,
        content: base?.content ?? null,
        contentText: base?.contentText ?? "",
        status: "accepted",
        baseVersionId: current.id,
        createdBy: input.userId,
      })
      .returning({ id: planVersions.id });
    if (!version) throw new Error("Plan version insert failed");

    await tx.update(planVersions).set({ status: "superseded" }).where(eq(planVersions.id, current.id));

    const currentRequirements = await tx
      .select()
      .from(requirements)
      .where(eq(requirements.planVersionId, current.id));
    const baseRequirements = base
      ? await tx.select().from(requirements).where(eq(requirements.planVersionId, base.id))
      : [];

    if (baseRequirements.length > 0) {
      const copied = await tx
        .insert(requirements)
        .values(
          baseRequirements.map((requirement) => ({
            workspaceId: requirement.workspaceId,
            docId: requirement.docId,
            planVersionId: version.id,
            stableKey: requirement.stableKey,
            title: requirement.title,
            description: requirement.description,
            acceptanceCriteria: requirement.acceptanceCriteria,
            status: requirement.status,
            changeType: "unchanged",
            confidence: requirement.confidence,
            previousRequirementId: requirement.id,
          }))
        )
        .returning({ id: requirements.id, previousRequirementId: requirements.previousRequirementId });
      const newIdByOld = new Map(copied.map((row) => [row.previousRequirementId, row.id]));

      const baseLinks = await tx
        .select()
        .from(requirementTaskLinks)
        .where(inArray(requirementTaskLinks.requirementId, baseRequirements.map((item) => item.id)));
      const linkValues = baseLinks.flatMap((link) => {
        const requirementId = newIdByOld.get(link.requirementId);
        return requirementId
          ? [{ workspaceId: link.workspaceId, requirementId, taskId: link.taskId, createdBy: input.userId }]
          : [];
      });
      if (linkValues.length > 0) {
        await tx.insert(requirementTaskLinks).values(linkValues).onConflictDoNothing();
      }
    }

    const requirementDiff = diffRequirements(currentRequirements, baseRequirements);
    const now = new Date();
    const [revert] = await tx
      .insert(changeSets)
      .values({
        workspaceId: changeSet.workspaceId,
        docId: changeSet.docId,
        baseVersionId: current.id,
        proposedVersionId: version.id,
        status: "applied",
        summary: base
          ? `Undo of plan v${current.versionNumber}: restored the content of v${base.versionNumber}.`
          : `Undo of plan v${current.versionNumber}: cleared the first accepted baseline.`,
        stats: {
          added: requirementDiff.added.length,
          modified: requirementDiff.modified.length,
          removed: requirementDiff.removed.length,
          unchanged: requirementDiff.unchanged,
          proposals: plan.ops.length,
        },
        revertsChangeSetId: changeSet.id,
        createdBy: input.userId,
        resolvedBy: input.userId,
        resolvedAt: now,
      })
      .returning({ id: changeSets.id });
    if (!revert) throw new Error("Reverting change set insert failed");

    for (const op of plan.ops) {
      await tx
        .update(tasks)
        .set({
          title: op.target.title,
          description: op.target.description,
          priority: op.target.priority as TaskPriority,
          isArchived: op.target.isArchived,
          docId: op.target.docId,
          updatedAt: now,
        })
        .where(and(eq(tasks.id, op.taskId), eq(tasks.workspaceId, changeSet.workspaceId)));
    }
    if (plan.ops.length > 0) {
      await tx.insert(changeProposals).values(
        plan.ops.map((op) => ({
          changeSetId: revert.id,
          workspaceId: changeSet.workspaceId,
          taskId: op.taskId,
          action: op.action,
          title: op.target.title,
          description: op.target.description,
          priority: op.target.priority,
          rationale: `Undo of change set ${changeSet.id}`,
          confidence: 100,
          status: "applied",
          appliedAt: now,
          metadata: {
            undoBefore: op.before,
            undoOfProposalIds: op.sourceProposalIds,
          },
        }))
      );
    }

    // Alignment is derived from links to the accepted version; recompute it
    // for every task this plan or the undone change set touched.
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
          alignment_updated_at = now()
      WHERE workspace_id = ${changeSet.workspaceId}::uuid
        AND (
          doc_id = ${changeSet.docId}::uuid
          OR id IN (
            SELECT task_id FROM change_proposals
            WHERE change_set_id = ${changeSet.id}::uuid AND task_id IS NOT NULL
          )
        )
    `);

    const pushed = await tx
      .select({ id: externalWriteOperations.id })
      .from(externalWriteOperations)
      .where(
        and(
          eq(externalWriteOperations.changeSetId, changeSet.id),
          eq(externalWriteOperations.status, "succeeded")
        )
      );

    return {
      ok: true,
      changeSetId: revert.id,
      versionId: version.id,
      versionNumber,
      restoredVersionNumber: base?.versionNumber ?? null,
      revertedTasks: plan.ops.length,
      externalNotReverted: pushed.length,
    } as const;
  });
}
