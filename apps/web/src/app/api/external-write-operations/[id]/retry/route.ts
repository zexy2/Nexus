import { logInternalError } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { externalWriteOperations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner } from "@/lib/workspace-auth";
import { startWorkflowOnce } from "@/lib/temporal-start";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const operation = await db.query.externalWriteOperations.findFirst({
    where: eq(externalWriteOperations.id, id),
  });
  if (!operation) {
    return NextResponse.json({ error: "External write operation not found" }, { status: 404 });
  }

  const access = await requireWorkspaceOwner(session.user.id, operation.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!operation.changeSetId) {
    return NextResponse.json(
      { error: "CHANGE_SET_NOT_FOUND", message: "External operation is not linked to a change set." },
      { status: 409 }
    );
  }

  const retryable =
    operation.status === "failed_retryable" ||
    (operation.status === "succeeded" && operation.syncStatus === "failed_retryable");
  if (!retryable) {
    return NextResponse.json(
      {
        error: "OPERATION_NOT_RETRYABLE",
        message: "Only failed retryable operations can be retried.",
      },
      { status: 409 }
    );
  }

  try {
    // Deterministic id: a second click while the retry is running attaches to
    // it instead of starting a duplicate retry of the same operation.
    const result = await startWorkflowOnce(
      "externalWriteRetryWorkflow",
      {
        operationId: operation.id,
        changeSetId: operation.changeSetId,
        userId: session.user.id,
      },
      { workflowId: `external-write-retry-${operation.id}` }
    );
    return NextResponse.json({ ok: true, ...result, status: "running" }, { status: 202 });
  } catch (error) {
    const requestId = logInternalError("External write retry", error, _request.headers);
    return NextResponse.json(
      { error: "TEMPORAL_UNAVAILABLE", message: "Workflow engine is unavailable.", requestId },
      { status: 503 }
    );
  }
}
