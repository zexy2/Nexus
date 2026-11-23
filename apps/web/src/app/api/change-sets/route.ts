import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { changeProposals, changeSets, docs } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceIds = await getAccessibleWorkspaceIds(session.user.id);
  if (workspaceIds.length === 0) {
    return NextResponse.json([]);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const docId = url.searchParams.get("docId");
  const requestedLimit = Number(url.searchParams.get("limit") || 30);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 30;

  const conditions = [inArray(changeSets.workspaceId, workspaceIds)];
  if (status) conditions.push(eq(changeSets.status, status));
  if (docId) conditions.push(eq(changeSets.docId, docId));

  // One round trip: proposal counts are aggregated per change set in a
  // grouped subquery and LEFT JOINed (previously one query per change set).
  const proposalCounts = db
    .select({
      changeSetId: changeProposals.changeSetId,
      total: sql<number>`count(*)::int`.as("total"),
      pending: sql<number>`count(*) filter (where ${changeProposals.status} = 'pending')::int`.as("pending"),
      applied: sql<number>`count(*) filter (where ${changeProposals.status} = 'applied')::int`.as("applied"),
      rejected: sql<number>`count(*) filter (where ${changeProposals.status} = 'rejected')::int`.as("rejected"),
    })
    .from(changeProposals)
    // Scope the aggregate to the caller's workspaces (indexed) so it never
    // groups the whole table.
    .where(inArray(changeProposals.workspaceId, workspaceIds))
    .groupBy(changeProposals.changeSetId)
    .as("proposal_counts");

  const rows = await db
    .select({
      changeSet: changeSets,
      docTitle: docs.title,
      total: proposalCounts.total,
      pending: proposalCounts.pending,
      applied: proposalCounts.applied,
      rejected: proposalCounts.rejected,
    })
    .from(changeSets)
    .innerJoin(docs, eq(docs.id, changeSets.docId))
    .leftJoin(proposalCounts, eq(proposalCounts.changeSetId, changeSets.id))
    .where(and(...conditions))
    .orderBy(desc(changeSets.createdAt))
    .limit(limit);

  const result = rows.map(({ changeSet, docTitle, total, pending, applied, rejected }) => ({
    id: changeSet.id,
    docId: changeSet.docId,
    docTitle,
    status: changeSet.status,
    summary: changeSet.summary,
    stats: changeSet.stats,
    workflowId: changeSet.temporalWorkflowId,
    proposals: {
      total: Number(total ?? 0),
      pending: Number(pending ?? 0),
      applied: Number(applied ?? 0),
      rejected: Number(rejected ?? 0),
    },
    createdAt: changeSet.createdAt.toISOString(),
    resolvedAt: changeSet.resolvedAt?.toISOString() || null,
  }));

  return NextResponse.json(result);
}
