import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { agentExecutions, changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { logInternalError } from "@/lib/api-response";
import { getAccessibleWorkspaceIds, requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";
import { reconcileWorkflowExecution } from "@/lib/workflow-reconcile";
import { resolveExecutionOwner, workflowTypeOf } from "@/lib/notifications";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isClosedWorkflowError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "WorkflowNotFoundError" ||
    /not found|already completed|already closed|workflow execution already completed/i.test(message)
  );
}

/**
 * POST /api/workflows/:id/cancel — request Temporal cancellation of a run.
 *
 * `id` is the Temporal workflow id (or the execution id). Only the user who
 * started the run, or a workspace owner/admin, may cancel. The call is
 * idempotent: the first request records `cancel_requested_at` and asks
 * Temporal to cancel; repeats answer 202 without a second RPC. A run that
 * already finished answers 409. The row stays `running` until
 * reconciliation observes the CANCELLED close status, after the workflow's
 * own cleanup ran.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.workflowStatus,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;
  const { id } = await context.params;

  const workspaceIds = await getAccessibleWorkspaceIds(userId);
  if (workspaceIds.length === 0) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const idMatch = UUID_RE.test(id)
    ? or(eq(agentExecutions.temporalWorkflowId, id), eq(agentExecutions.id, id))
    : eq(agentExecutions.temporalWorkflowId, id);
  const execution = await db.query.agentExecutions.findFirst({
    where: and(inArray(agentExecutions.workspaceId, workspaceIds), idMatch),
  });
  if (!execution || !execution.temporalWorkflowId) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  const workflowId = execution.temporalWorkflowId;

  const access = await requireWorkspaceAccess(userId, execution.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const ownerId = await resolveExecutionOwner(execution);
  const isPrivileged = access.role === "owner" || access.role === "admin";
  if (ownerId !== userId && !isPrivileged) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Only the user who started this run or a workspace admin can cancel it." },
      { status: 403 }
    );
  }

  // In-process commands (cmd-*) have no Temporal run to cancel.
  if (workflowId.startsWith("cmd-")) {
    return NextResponse.json(
      { error: "WORKFLOW_NOT_CANCELLABLE", message: "This run cannot be cancelled." },
      { status: 409 }
    );
  }

  // Pick up a close that happened since the last poll before deciding.
  const current = await reconcileWorkflowExecution(execution, { userId, request });
  if (current.status !== "running") {
    return NextResponse.json(
      { error: "WORKFLOW_ALREADY_FINISHED", message: "This run has already finished.", status: current.status },
      { status: 409 }
    );
  }

  // Once a plan review was approved/rejected the run is finishing that
  // decision; cancelling it now would leave the decision half applied.
  if (workflowTypeOf(execution) === "plan_impact") {
    const changeSet = await db.query.changeSets.findFirst({
      where: eq(changeSets.temporalWorkflowId, workflowId),
      orderBy: [desc(changeSets.createdAt)],
    });
    if (changeSet && changeSet.status !== "pending") {
      return NextResponse.json(
        {
          error: "WORKFLOW_ALREADY_FINISHED",
          message: "The plan review was already resolved; the run is finishing.",
          status: changeSet.status,
        },
        { status: 409 }
      );
    }
  }

  const requestedAt = new Date();
  const [claimed] = await db
    .update(agentExecutions)
    .set({ cancelRequestedAt: requestedAt })
    .where(
      and(
        eq(agentExecutions.id, execution.id),
        eq(agentExecutions.status, "running"),
        isNull(agentExecutions.cancelRequestedAt)
      )
    )
    .returning();

  if (!claimed) {
    // Lost the race: either a cancel is already in flight (double click) or
    // the row just closed.
    const latest = await db.query.agentExecutions.findFirst({
      where: eq(agentExecutions.id, execution.id),
    });
    if (latest?.status === "running" && latest.cancelRequestedAt) {
      return NextResponse.json(
        {
          workflowId,
          executionId: execution.id,
          status: "cancelling",
          cancelRequestedAt: latest.cancelRequestedAt,
          alreadyRequested: true,
        },
        { status: 202 }
      );
    }
    return NextResponse.json(
      { error: "WORKFLOW_ALREADY_FINISHED", message: "This run has already finished.", status: latest?.status ?? null },
      { status: 409 }
    );
  }

  try {
    const temporal = await import("@nexus/workflows/client");
    await temporal.createTemporalClient();
    await temporal.cancelWorkflow(workflowId);
  } catch (error) {
    // Undo the claim so the user can retry.
    await db
      .update(agentExecutions)
      .set({ cancelRequestedAt: null })
      .where(eq(agentExecutions.id, execution.id));

    if (isClosedWorkflowError(error)) {
      const settled = await reconcileWorkflowExecution(
        { ...execution, cancelRequestedAt: null },
        { userId, request }
      );
      return NextResponse.json(
        { error: "WORKFLOW_ALREADY_FINISHED", message: "This run has already finished.", status: settled.status },
        { status: 409 }
      );
    }

    const requestId = logInternalError("Workflow cancel", error, request.headers);
    return NextResponse.json(
      { error: "TEMPORAL_UNAVAILABLE", message: "The workflow engine is unavailable. Please try again.", requestId },
      { status: 503 }
    );
  }

  await writeAuditLog({
    userId,
    workspaceId: execution.workspaceId,
    event: "workflow.cancel_requested",
    metadata: {
      workflowId,
      executionId: execution.id,
      workflowType: workflowTypeOf(execution),
      onBehalfOf: ownerId && ownerId !== userId ? ownerId : undefined,
    },
    request,
  });

  return NextResponse.json(
    {
      workflowId,
      executionId: execution.id,
      status: "cancelling",
      cancelRequestedAt: requestedAt,
    },
    { status: 202 }
  );
}
