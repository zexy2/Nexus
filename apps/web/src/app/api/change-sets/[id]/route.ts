import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import {
  changeProposals,
  changeSets,
  docs,
  externalWriteOperations,
  requirements,
  tasks,
} from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const row = await db
    .select({
      changeSet: changeSets,
      docTitle: docs.title,
    })
    .from(changeSets)
    .innerJoin(docs, eq(docs.id, changeSets.docId))
    .where(eq(changeSets.id, id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row) {
    return NextResponse.json({ error: "Change set not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, row.changeSet.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const proposals = await db
    .select({
      proposal: changeProposals,
      requirementKey: requirements.stableKey,
      requirementTitle: requirements.title,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      taskAlignmentStatus: tasks.alignmentStatus,
    })
    .from(changeProposals)
    .leftJoin(requirements, eq(requirements.id, changeProposals.requirementId))
    .leftJoin(tasks, eq(tasks.id, changeProposals.taskId))
    .where(eq(changeProposals.changeSetId, id));

  const proposalIds = proposals.map(({ proposal }) => proposal.id);
  const operations = proposalIds.length > 0
    ? await db.query.externalWriteOperations.findMany({
        where: inArray(externalWriteOperations.changeProposalId, proposalIds),
      })
    : [];
  const operationsByProposalId = new Map<string, typeof operations>();
  for (const operation of operations) {
    const proposalId = operation.changeProposalId;
    if (!proposalId) continue;
    operationsByProposalId.set(proposalId, [
      ...(operationsByProposalId.get(proposalId) || []),
      operation,
    ]);
  }

  return NextResponse.json({
    id: row.changeSet.id,
    docId: row.changeSet.docId,
    docTitle: row.docTitle,
    status: row.changeSet.status,
    summary: row.changeSet.summary,
    stats: row.changeSet.stats,
    workflowId: row.changeSet.temporalWorkflowId,
    createdAt: row.changeSet.createdAt.toISOString(),
    resolvedAt: row.changeSet.resolvedAt?.toISOString() || null,
    proposals: proposals.map(
      ({
        proposal,
        requirementKey,
        requirementTitle,
        taskTitle,
        taskStatus,
        taskAlignmentStatus,
      }) => ({
        id: proposal.id,
        action: proposal.action,
        title: proposal.title,
        description: proposal.description,
        priority: proposal.priority,
        rationale: proposal.rationale,
        confidence: proposal.confidence,
        status: proposal.status,
        metadata: proposal.metadata,
        externalOperations: (operationsByProposalId.get(proposal.id) || []).map((operation) => ({
          id: operation.id,
          provider: operation.provider,
          operationType: operation.operationType,
          status: operation.status,
          error: operation.error,
          response: operation.response,
          attemptedAt: operation.attemptedAt?.toISOString() || null,
          completedAt: operation.completedAt?.toISOString() || null,
        })),
        requirement: proposal.requirementId
          ? {
              id: proposal.requirementId,
              stableKey: requirementKey,
              title: requirementTitle,
            }
          : null,
        task: proposal.taskId
          ? {
              id: proposal.taskId,
              title: taskTitle,
              status: taskStatus,
              alignmentStatus: taskAlignmentStatus,
            }
          : null,
      })
    ),
  });
}
