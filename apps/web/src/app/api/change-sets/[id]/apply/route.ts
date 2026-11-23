import { logInternalError } from "@/lib/api-response";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { changeProposals, changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";
import { loadTemporalClient, startWorkflowOnce } from "@/lib/temporal-start";

export const runtime = "nodejs";

const TERMINAL_CHANGE_SET_STATUSES = new Set([
  "applied",
  "partially_applied",
  "external_failed",
  "rejected",
  "expired",
]);

function isClosedWorkflowError(message: string) {
  return /already completed|not found|closed|completed workflow|workflow execution already completed/i.test(message);
}

// Recovery workflow ids are deterministic per change set, so concurrent clicks
// attach to the run already in flight instead of starting duplicates (see
// startWorkflowOnce). Once a run closes, the same id can be started again.
function applyRecoveryWorkflowId(changeSetId: string) {
  return `change-set-apply-${changeSetId}`;
}

function externalWriteRecoveryWorkflowId(changeSetId: string) {
  return `change-set-external-${changeSetId}`;
}

async function startApplyRecoveryWorkflow(input: {
  changeSetId: string;
  selectedProposalIds: string[];
  userId: string;
}) {
  return startWorkflowOnce("applyPlanChangeSetWorkflow", input, {
    workflowId: applyRecoveryWorkflowId(input.changeSetId),
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "nexus-agents",
  });
}

async function startExternalWriteRecoveryWorkflow(input: {
  changeSetId: string;
  userId: string;
}) {
  return startWorkflowOnce("runExternalWriteOperationsWorkflow", input, {
    workflowId: externalWriteRecoveryWorkflowId(input.changeSetId),
    taskQueue: process.env.TEMPORAL_TASK_QUEUE || "nexus-agents",
  });
}

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
  if (TERMINAL_CHANGE_SET_STATUSES.has(changeSet.status)) {
    return NextResponse.json({
      ok: true,
      changeSetId: id,
      status: changeSet.status,
      alreadyResolved: true,
    });
  }
  if (changeSet.status === "external_pending") {
    try {
      const recovery = await startExternalWriteRecoveryWorkflow({
        changeSetId: id,
        userId: session.user.id,
      });

      if (!recovery.alreadyRunning) {
        await writeAuditLog({
          userId: session.user.id,
          workspaceId: changeSet.workspaceId,
          event: "plan.external_write_recovery_started",
          metadata: {
            changeSetId: id,
            recoveryWorkflowId: recovery.workflowId,
          },
          request,
        });
      }

      return NextResponse.json(
        {
          ok: true,
          changeSetId: id,
          workflowId: recovery.workflowId,
          status: "external_pending",
          recovery: true,
          alreadyRunning: recovery.alreadyRunning,
        },
        { status: 202 }
      );
    } catch (error) {
      const requestId = logInternalError("Change set apply recovery", error, request.headers);
      return NextResponse.json(
        {
          error: "TEMPORAL_UNAVAILABLE",
          message: "Workflow engine is unavailable.",
          requestId,
        },
        { status: 503 }
      );
    }
  }
  if (changeSet.status !== "pending") {
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
    if (!changeSet.temporalWorkflowId) {
      const recovery = await startApplyRecoveryWorkflow({
        changeSetId: id,
        selectedProposalIds,
        userId: session.user.id,
      });

      if (!recovery.alreadyRunning) {
        await writeAuditLog({
          userId: session.user.id,
          workspaceId: changeSet.workspaceId,
          event: "plan.change_apply_recovery_started",
          metadata: {
            changeSetId: id,
            selectedProposalIds,
            recoveryWorkflowId: recovery.workflowId,
            reason: "missing_temporal_workflow_id",
          },
          request,
        });
      }

      return NextResponse.json(
        {
          ok: true,
          changeSetId: id,
          workflowId: recovery.workflowId,
          status: "applying",
          recovery: true,
          alreadyRunning: recovery.alreadyRunning,
        },
        { status: 202 }
      );
    }

    const temporal = await loadTemporalClient();
    await temporal.signalWorkflow(changeSet.temporalWorkflowId, "resolvePlanChange", [
      {
        decision: "approve",
        selectedProposalIds,
        userId: session.user.id,
      },
    ]);

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
    const message = error instanceof Error ? error.message : "Workflow engine is unavailable";
    if (isClosedWorkflowError(message)) {
      try {
        const recovery = await startApplyRecoveryWorkflow({
          changeSetId: id,
          selectedProposalIds,
          userId: session.user.id,
        });

        if (!recovery.alreadyRunning) {
          await writeAuditLog({
            userId: session.user.id,
            workspaceId: changeSet.workspaceId,
            event: "plan.change_apply_recovery_started",
            metadata: {
              changeSetId: id,
              selectedProposalIds,
              previousWorkflowId: changeSet.temporalWorkflowId,
              recoveryWorkflowId: recovery.workflowId,
              reason: message,
            },
            request,
          });
        }

        return NextResponse.json(
          {
            ok: true,
            changeSetId: id,
            previousWorkflowId: changeSet.temporalWorkflowId,
            workflowId: recovery.workflowId,
            status: "applying",
            recovery: true,
            alreadyRunning: recovery.alreadyRunning,
          },
          { status: 202 }
        );
      } catch (recoveryError) {
        const requestId = logInternalError("Change set apply recovery", recoveryError, request.headers);
        return NextResponse.json(
          {
            error: "TEMPORAL_UNAVAILABLE",
            message: "Workflow engine is unavailable.",
            requestId,
          },
          { status: 503 }
        );
      }
    }
    if (message.includes("Change set has already been resolved")) {
      return NextResponse.json(
        {
          ok: true,
          changeSetId: id,
          status: "already_resolved",
          alreadyResolved: true,
          message: "This plan version has already been resolved.",
        },
        { status: 200 }
      );
    }
    const requestId = logInternalError("Change set apply", error, request.headers);
    return NextResponse.json(
      {
        error: "TEMPORAL_UNAVAILABLE",
        message: "Workflow engine is unavailable.",
        requestId,
      },
      { status: 503 }
    );
  }
}
