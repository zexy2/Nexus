import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { agentJobEvents, agentJobs, agentJobSubmissions, tasks } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";

class ReviewConflictError extends Error {
  constructor(code: string, readonly status: number) {
    super(code);
    this.name = "ReviewConflictError";
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  if (!decision) return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
  const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.id, id) });
  if (!job) return NextResponse.json({ error: "Agent job not found" }, { status: 404 });
  const access = await requireWorkspaceAccess(session.user.id, job.workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (job.status === "outdated") {
    return NextResponse.json({ error: "AGENT_CONTEXT_OUTDATED" }, { status: 409 });
  }
  if (job.status !== "submitted") {
    return NextResponse.json({ error: "JOB_NOT_SUBMITTED" }, { status: 409 });
  }

  const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;
  let outcome: { submissionId: string } | { error: string; status: number };
  try {
    outcome = await db.transaction(async (tx) => {
      const now = new Date();
      // Guarded transition: only one concurrent review (approve, reject or a
      // second click) can move the job out of "submitted"; it also loses
      // against a concurrent outdate. The row lock serializes the rest.
      const [transitioned] = await tx.update(agentJobs).set({
        status: decision === "approve" ? "approved" : "rejected",
        completedAt: now,
        updatedAt: now,
      }).where(and(eq(agentJobs.id, id), eq(agentJobs.status, "submitted"))).returning({ id: agentJobs.id });
      if (!transitioned) throw new ReviewConflictError("JOB_NOT_SUBMITTED", 409);

      const submission = await tx.query.agentJobSubmissions.findFirst({
        where: and(eq(agentJobSubmissions.jobId, id), eq(agentJobSubmissions.reviewStatus, "pending")),
        orderBy: [desc(agentJobSubmissions.revision)],
      });
      if (!submission) throw new ReviewConflictError("SUBMISSION_NOT_FOUND", 404);
      const [reviewed] = await tx.update(agentJobSubmissions).set({
        reviewStatus: decision === "approve" ? "approved" : "rejected",
        reviewNote: note,
        reviewedBy: session.user.id,
        reviewedAt: now,
      }).where(and(
        eq(agentJobSubmissions.id, submission.id),
        eq(agentJobSubmissions.reviewStatus, "pending")
      )).returning({ id: agentJobSubmissions.id });
      if (!reviewed) throw new ReviewConflictError("SUBMISSION_ALREADY_REVIEWED", 409);

      await tx.update(tasks).set({
        status: decision === "approve" ? "done" : "in_progress",
        completedAt: decision === "approve" ? now : null,
        updatedAt: now,
      }).where(eq(tasks.id, job.taskId));
      await tx.insert(agentJobEvents).values({
        jobId: id,
        workspaceId: job.workspaceId,
        type: decision === "approve" ? "approved" : "rejected",
        message: note,
      });
      return { submissionId: submission.id };
    });
  } catch (error) {
    if (!(error instanceof ReviewConflictError)) throw error;
    outcome = { error: error.message, status: error.status };
  }
  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  await writeAuditLog({
    userId: session.user.id,
    workspaceId: job.workspaceId,
    event: decision === "approve" ? "agent.result_approved" : "agent.result_rejected",
    metadata: { jobId: id, submissionId: outcome.submissionId, taskId: job.taskId },
    request,
  });
  return NextResponse.json({ ok: true, status: decision === "approve" ? "approved" : "rejected" });
}
