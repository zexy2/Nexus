import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  changeSets,
  docs,
  externalWriteOperations,
  planVersions,
  requirements,
  users,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { expirePendingChangeSetIfOrphaned } from "@/lib/change-set-recovery";
import { canUndoRole, undoEligibility } from "@/lib/plan-history/eligibility";

export const runtime = "nodejs";

const MAX_VERSIONS = 200;

/**
 * GET /api/plans/[docId]/versions — the plan's version history, newest first:
 * who created each version, when, which change set / workflow produced it,
 * whether it was undone, and whether it can be undone now.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { docId } = await context.params;
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc || doc.isArchived === 1) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, doc.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const pendingCandidate = await db.query.changeSets.findFirst({
    where: and(eq(changeSets.docId, docId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });
  const pendingChangeSet =
    pendingCandidate &&
    (await expirePendingChangeSetIfOrphaned(pendingCandidate, { checkWorkflow: false }))
      ? undefined
      : pendingCandidate;

  const versions = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.docId, docId))
    .orderBy(desc(planVersions.versionNumber))
    .limit(MAX_VERSIONS);

  const versionIds = versions.map((version) => version.id);
  const changeSetRows = versionIds.length
    ? await db
        .select()
        .from(changeSets)
        .where(and(eq(changeSets.docId, docId), inArray(changeSets.proposedVersionId, versionIds)))
    : [];
  const changeSetIds = changeSetRows.map((row) => row.id);

  const revertRows = changeSetIds.length
    ? await db
        .select({ id: changeSets.id, revertsChangeSetId: changeSets.revertsChangeSetId })
        .from(changeSets)
        .where(inArray(changeSets.revertsChangeSetId, changeSetIds))
    : [];
  const revertedBy = new Map(revertRows.map((row) => [row.revertsChangeSetId, row.id]));

  const userIds = Array.from(
    new Set(
      [
        ...versions.map((version) => version.createdBy),
        ...changeSetRows.map((row) => row.resolvedBy),
      ].filter((id): id is string => Boolean(id))
    )
  );
  const userRows = userIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
    : [];
  const userName = new Map(userRows.map((row) => [row.id, row.name]));

  const requirementCounts = versionIds.length
    ? await db
        .select({
          planVersionId: requirements.planVersionId,
          count: sql<number>`count(*)::int`,
        })
        .from(requirements)
        .where(and(inArray(requirements.planVersionId, versionIds), eq(requirements.status, "active")))
        .groupBy(requirements.planVersionId)
    : [];
  const requirementCount = new Map(requirementCounts.map((row) => [row.planVersionId, Number(row.count)]));

  const externalRows = changeSetIds.length
    ? await db
        .select({
          changeSetId: externalWriteOperations.changeSetId,
          provider: externalWriteOperations.provider,
          status: externalWriteOperations.status,
        })
        .from(externalWriteOperations)
        .where(inArray(externalWriteOperations.changeSetId, changeSetIds))
    : [];
  const externalByChangeSet = new Map<string, { pushed: number; providers: string[] }>();
  for (const row of externalRows) {
    if (row.status !== "succeeded" || !row.changeSetId) continue;
    const entry = externalByChangeSet.get(row.changeSetId) ?? { pushed: 0, providers: [] };
    entry.pushed++;
    if (!entry.providers.includes(row.provider)) entry.providers.push(row.provider);
    externalByChangeSet.set(row.changeSetId, entry);
  }

  const changeSetByVersion = new Map(changeSetRows.map((row) => [row.proposedVersionId, row]));
  const versionNumberById = new Map(versions.map((version) => [version.id, version.versionNumber]));
  const changeSetById = new Map(changeSetRows.map((row) => [row.id, row]));
  const current = versions.find((version) => version.status === "accepted") ?? null;

  return NextResponse.json({
    doc: { id: doc.id, title: doc.title },
    canUndo: canUndoRole(access.role),
    currentVersionId: current?.id ?? null,
    pendingChangeSetId: pendingChangeSet?.id ?? null,
    versions: versions.map((version) => {
      const changeSet = changeSetByVersion.get(version.id);
      const reverted = changeSet?.revertsChangeSetId
        ? changeSetById.get(changeSet.revertsChangeSetId)
        : undefined;
      const revertedByChangeSetId = changeSet ? revertedBy.get(changeSet.id) ?? null : null;
      return {
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        status: version.status,
        createdAt: version.createdAt.toISOString(),
        createdBy: version.createdBy
          ? { id: version.createdBy, name: userName.get(version.createdBy) ?? null }
          : null,
        baseVersionId: version.baseVersionId,
        baseVersionNumber: version.baseVersionId
          ? versionNumberById.get(version.baseVersionId) ?? null
          : null,
        requirementCount: requirementCount.get(version.id) ?? 0,
        changeSet: changeSet
          ? {
              id: changeSet.id,
              status: changeSet.status,
              summary: changeSet.summary,
              stats: changeSet.stats,
              workflowId: changeSet.temporalWorkflowId,
              createdAt: changeSet.createdAt.toISOString(),
              resolvedAt: changeSet.resolvedAt?.toISOString() ?? null,
              resolvedBy: changeSet.resolvedBy
                ? { id: changeSet.resolvedBy, name: userName.get(changeSet.resolvedBy) ?? null }
                : null,
              revertsChangeSetId: changeSet.revertsChangeSetId,
              revertsVersionNumber: reverted
                ? versionNumberById.get(reverted.proposedVersionId) ?? null
                : null,
              revertedByChangeSetId,
              externalWrites: externalByChangeSet.get(changeSet.id) ?? { pushed: 0, providers: [] },
              undo: undoEligibility({
                role: access.role,
                changeSetStatus: changeSet.status,
                proposedVersionId: changeSet.proposedVersionId,
                currentVersionId: current?.id ?? null,
                pendingChangeSetId: pendingChangeSet?.id ?? null,
                revertedByChangeSetId,
              }),
            }
          : null,
      };
    }),
  });
}
