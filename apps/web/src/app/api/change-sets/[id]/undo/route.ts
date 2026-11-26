import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { changeSets } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { logInternalError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/production-guardrails";
import { expirePendingChangeSetIfOrphaned } from "@/lib/change-set-recovery";
import { canUndoRole } from "@/lib/plan-history/eligibility";
import { undoChangeSet } from "@/lib/plan-history/undo";

export const runtime = "nodejs";

/**
 * POST /api/change-sets/[id]/undo — revert an applied change set by writing a
 * new reverting change set (history is kept). Owners and admins only. Refuses
 * with 409 while a plan review is pending, when the change set is not the one
 * behind the current plan version, or when its tasks were edited afterwards.
 * External writes already pushed to GitHub/Linear are not reverted.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const changeSet = await db.query.changeSets.findFirst({ where: eq(changeSets.id, id) });
  if (!changeSet) {
    return NextResponse.json({ error: "Change set not found" }, { status: 404 });
  }

  const access = await requireWorkspaceAccess(session.user.id, changeSet.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!canUndoRole(access.role)) {
    return NextResponse.json(
      {
        error: "UNDO_FORBIDDEN",
        message: "Only workspace owners and admins can undo applied plan changes.",
      },
      { status: 403 }
    );
  }

  // Same pending-review lock as analyze-change; an orphaned review is expired
  // first so it cannot block undo forever.
  const pending = await db.query.changeSets.findFirst({
    where: and(eq(changeSets.docId, changeSet.docId), eq(changeSets.status, "pending")),
    orderBy: [desc(changeSets.createdAt)],
  });
  if (pending && !(await expirePendingChangeSetIfOrphaned(pending, { userId: session.user.id }))) {
    return NextResponse.json(
      {
        error: "CHANGE_REVIEW_PENDING",
        message: "Resolve the pending plan review before undoing a change.",
        changeSetId: pending.id,
      },
      { status: 409 }
    );
  }

  try {
    const result = await undoChangeSet({ changeSetId: id, userId: session.user.id });
    if (!result.ok) {
      switch (result.code) {
        case "NOT_FOUND":
          return NextResponse.json({ error: "Change set not found" }, { status: 404 });
        case "CHANGE_REVIEW_PENDING":
          return NextResponse.json(
            {
              error: "CHANGE_REVIEW_PENDING",
              message: "Resolve the pending plan review before undoing a change.",
              changeSetId: result.changeSetId,
            },
            { status: 409 }
          );
        case "NOT_UNDOABLE":
          return NextResponse.json(
            {
              error: result.status === "external_pending" ? "EXTERNAL_PENDING" : "NOT_UNDOABLE",
              message: "Only applied change sets can be undone.",
              status: result.status,
            },
            { status: 409 }
          );
        case "ALREADY_REVERTED":
          return NextResponse.json(
            {
              error: "ALREADY_REVERTED",
              message: "This change set has already been undone.",
              revertChangeSetId: result.revertChangeSetId,
            },
            { status: 409 }
          );
        case "NOT_LATEST":
          return NextResponse.json(
            {
              error: "NOT_LATEST",
              message: "Later plan changes were applied after this one. Undo the newest change first.",
            },
            { status: 409 }
          );
        case "UNDO_CONFLICT":
          return NextResponse.json(
            {
              error: "UNDO_CONFLICT",
              message: "Some tasks were edited after this change was applied, so it cannot be undone safely.",
              conflicts: result.conflicts,
            },
            { status: 409 }
          );
        case "UNDO_UNSUPPORTED":
          return NextResponse.json(
            {
              error: "UNDO_UNSUPPORTED",
              message: "This change set was applied before undo support and cannot restore the previous task values.",
              proposalIds: result.proposalIds,
            },
            { status: 409 }
          );
      }
    }

    await writeAuditLog({
      userId: session.user.id,
      workspaceId: changeSet.workspaceId,
      event: "plan.change_reverted",
      metadata: {
        changeSetId: id,
        revertChangeSetId: result.changeSetId,
        versionId: result.versionId,
        revertedTasks: result.revertedTasks,
        externalNotReverted: result.externalNotReverted,
      },
      request,
    });

    return NextResponse.json(
      {
        ok: true,
        revertedChangeSetId: id,
        changeSetId: result.changeSetId,
        versionId: result.versionId,
        versionNumber: result.versionNumber,
        restoredVersionNumber: result.restoredVersionNumber,
        revertedTasks: result.revertedTasks,
        externalNotReverted: result.externalNotReverted,
      },
      { status: 201 }
    );
  } catch (error) {
    const requestId = logInternalError("Change set undo", error, request.headers);
    return NextResponse.json(
      { error: "UNDO_FAILED", message: "The change could not be undone.", requestId },
      { status: 500 }
    );
  }
}
