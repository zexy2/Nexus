import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  changeProposals,
  changeSets,
  docs,
  planVersions,
  requirements,
  requirementTaskLinks,
  tasks,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";

export const runtime = "nodejs";

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

  const pendingChangeSet = await db.query.changeSets.findFirst({
    where: and(eq(changeSets.docId, docId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });

  const acceptedVersion = await db.query.planVersions.findFirst({
    where: and(eq(planVersions.docId, docId), eq(planVersions.status, "accepted")),
    orderBy: [desc(planVersions.versionNumber)],
  });

  const visibleVersionId = acceptedVersion?.id || pendingChangeSet?.proposedVersionId;
  const requirementRows = visibleVersionId
    ? await db
        .select()
        .from(requirements)
        .where(eq(requirements.planVersionId, visibleVersionId))
    : [];

  const requirementIds = requirementRows.map((item) => item.id);
  const links = requirementIds.length > 0
    ? await db
        .select({
          id: requirementTaskLinks.id,
          requirementId: requirementTaskLinks.requirementId,
          taskId: requirementTaskLinks.taskId,
          taskTitle: tasks.title,
          taskStatus: tasks.status,
          alignmentStatus: tasks.alignmentStatus,
          isArchived: tasks.isArchived,
        })
        .from(requirementTaskLinks)
        .innerJoin(tasks, eq(tasks.id, requirementTaskLinks.taskId))
        .where(inArray(requirementTaskLinks.requirementId, requirementIds))
    : [];

  const linksByRequirement = new Map<string, typeof links>();
  for (const link of links) {
    const current = linksByRequirement.get(link.requirementId) || [];
    current.push(link);
    linksByRequirement.set(link.requirementId, current);
  }

  const activeRequirements = requirementRows.filter((item) => item.status === "active");
  const coveredRequirements = activeRequirements.filter(
    (item) => (linksByRequirement.get(item.id) || []).some((link) => link.isArchived === 0)
  ).length;

  const pendingProposalCount = pendingChangeSet
    ? await db
        .select({ id: changeProposals.id })
        .from(changeProposals)
        .where(
          and(
            eq(changeProposals.changeSetId, pendingChangeSet.id),
            eq(changeProposals.status, "pending")
          )
        )
        .then((rows) => rows.length)
    : 0;

  return NextResponse.json({
    doc: {
      id: doc.id,
      title: doc.title,
      workspaceId: doc.workspaceId,
      updatedAt: doc.updatedAt.toISOString(),
    },
    currentVersion: acceptedVersion
      ? {
          id: acceptedVersion.id,
          versionNumber: acceptedVersion.versionNumber,
          status: acceptedVersion.status,
          createdAt: acceptedVersion.createdAt.toISOString(),
        }
      : null,
    requirements: requirementRows.map((requirement) => ({
      id: requirement.id,
      stableKey: requirement.stableKey,
      title: requirement.title,
      description: requirement.description,
      acceptanceCriteria: requirement.acceptanceCriteria,
      status: requirement.status,
      changeType: requirement.changeType,
      confidence: requirement.confidence,
      tasks: linksByRequirement.get(requirement.id) || [],
    })),
    coverage: {
      covered: coveredRequirements,
      total: activeRequirements.length,
      percentage:
        activeRequirements.length === 0
          ? 0
          : Math.round((coveredRequirements / activeRequirements.length) * 100),
    },
    pendingChangeSet: pendingChangeSet
      ? {
          id: pendingChangeSet.id,
          status: pendingChangeSet.status,
          summary: pendingChangeSet.summary,
          stats: pendingChangeSet.stats,
          proposalCount: pendingProposalCount,
          workflowId: pendingChangeSet.temporalWorkflowId,
          createdAt: pendingChangeSet.createdAt.toISOString(),
        }
      : null,
  });
}
