import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
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

  const rows = await db
    .select({
      changeSet: changeSets,
      docTitle: docs.title,
    })
    .from(changeSets)
    .innerJoin(docs, eq(docs.id, changeSets.docId))
    .where(and(...conditions))
    .orderBy(desc(changeSets.createdAt))
    .limit(limit);

  const result = await Promise.all(
    rows.map(async ({ changeSet, docTitle }) => {
      const proposals = await db
        .select({ status: changeProposals.status })
        .from(changeProposals)
        .where(eq(changeProposals.changeSetId, changeSet.id));

      return {
        id: changeSet.id,
        docId: changeSet.docId,
        docTitle,
        status: changeSet.status,
        summary: changeSet.summary,
        stats: changeSet.stats,
        workflowId: changeSet.temporalWorkflowId,
        proposals: {
          total: proposals.length,
          pending: proposals.filter((proposal) => proposal.status === "pending").length,
          applied: proposals.filter((proposal) => proposal.status === "applied").length,
          rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
        },
        createdAt: changeSet.createdAt.toISOString(),
        resolvedAt: changeSet.resolvedAt?.toISOString() || null,
      };
    })
  );

  return NextResponse.json(result);
}
