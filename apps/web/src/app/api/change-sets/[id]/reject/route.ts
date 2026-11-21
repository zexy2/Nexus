import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";
import { resolveOrphanedChangeSet } from "@/lib/change-set-recovery";

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
  if (changeSet.status !== "pending") {
    return NextResponse.json(
      { error: "CHANGE_SET_NOT_PENDING", message: "This change set cannot be rejected." },
      { status: 409 }
    );
  }

  // No live workflow can resolve this change set (it has none, or it closed
  // without resolving the review): reject it directly so the doc unlocks.
  const rejectWithoutWorkflow = async (reason: string) => {
    const rejected = await resolveOrphanedChangeSet(id, "rejected", session.user.id, reason);
    if (!rejected) {
      return NextResponse.json(
        {
          error: "CHANGE_SET_ALREADY_RESOLVED",
          message: "This plan version has already been resolved.",
        },
        { status: 409 }
      );
    }
    await writeAuditLog({
      userId: session.user.id,
      workspaceId: changeSet.workspaceId,
      event: "plan.change_rejected_by_user",
      metadata: { changeSetId: id, recovered: true, reason },
      request,
    });
    return NextResponse.json(
      { ok: true, changeSetId: id, status: "rejected", recovered: true },
      { status: 200 }
    );
  };

  if (!changeSet.temporalWorkflowId) {
    return rejectWithoutWorkflow("workflow_missing");
  }

  try {
    const temporal = await import("@nexus/workflows/client");
    await temporal.signalWorkflow(changeSet.temporalWorkflowId, "resolvePlanChange", [{
      decision: "reject",
      userId: session.user.id,
    }]);

    await writeAuditLog({
      userId: session.user.id,
      workspaceId: changeSet.workspaceId,
      event: "plan.change_rejected_by_user",
      metadata: { changeSetId: id },
      request,
    });

    return NextResponse.json(
      {
        ok: true,
        changeSetId: id,
        workflowId: changeSet.temporalWorkflowId,
        status: "rejecting",
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow engine is unavailable";
    if (/already completed|not found|closed/i.test(message)) {
      // The DB row is still pending (checked above), so the workflow died
      // before resolving the review.
      try {
        return await rejectWithoutWorkflow("workflow_closed");
      } catch (recoveryError) {
        return NextResponse.json(
          {
            error: "CHANGE_SET_RECOVERY_FAILED",
            message: recoveryError instanceof Error ? recoveryError.message : "Could not reject the change set.",
          },
          { status: 500 }
        );
      }
    }
    return NextResponse.json(
      {
        error: "TEMPORAL_UNAVAILABLE",
        message,
      },
      { status: 503 }
    );
  }
}
