import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { changeProposals, changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const changeSet = await db.query.changeSets.findFirst({
    where: eq(changeSets.id, id),
  });
  if (!changeSet) {
    return NextResponse.json({ error: "Change set not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, changeSet.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (changeSet.status !== "pending" || !changeSet.temporalWorkflowId) {
    return NextResponse.json(
      { error: "CHANGE_SET_NOT_PENDING", message: "This change set cannot be applied." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const selectedProposalIds: string[] = Array.isArray(body.selectedProposalIds)
    ? Array.from(new Set<string>(body.selectedProposalIds.filter(
        (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
      )))
    : [];

  if (selectedProposalIds.length === 0) {
    return NextResponse.json(
      {
        error: "NO_PROPOSALS_SELECTED",
        message: "Select at least one pending proposal before applying a change set.",
      },
      { status: 400 }
    );
  }

  const pendingProposals = await db
    .select({ id: changeProposals.id })
    .from(changeProposals)
    .where(and(eq(changeProposals.changeSetId, id), eq(changeProposals.status, "pending")));
  const pendingIds = new Set(pendingProposals.map((proposal) => proposal.id));
  const unknownIds = selectedProposalIds.filter((proposalId) => !pendingIds.has(proposalId));

  if (unknownIds.length > 0) {
    return NextResponse.json(
      {
        error: "INVALID_PROPOSAL_SELECTION",
        message: "Selected proposals must belong to this pending change set.",
      },
      { status: 400 }
    );
  }

  try {
    const temporal = await import("@nexus/workflows/client");
    await temporal.signalWorkflow(changeSet.temporalWorkflowId, "resolvePlanChange", [{
      decision: "approve",
      selectedProposalIds,
      userId: session.user.id,
    }]);

    await writeAuditLog({
      userId: session.user.id,
      workspaceId: changeSet.workspaceId,
      event: "plan.change_approved",
      metadata: { changeSetId: id, selectedProposalIds },
      request,
    });

    return NextResponse.json(
      {
        ok: true,
        changeSetId: id,
        workflowId: changeSet.temporalWorkflowId,
        status: "applying",
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "TEMPORAL_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Workflow engine is unavailable",
      },
      { status: 503 }
    );
  }
}
