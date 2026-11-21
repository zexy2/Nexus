import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { agentJobEvents, agentJobs, agentJobSubmissions } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import {
  AGENT_JOB_ACTIVE_UNIQUE_INDEX,
  buildAgentContext,
  isUniqueViolation,
} from "@/lib/agent-handoff";
import { writeAuditLog } from "@/lib/production-guardrails";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.id, id) });
  if (!job) return NextResponse.json({ error: "Agent job not found" }, { status: 404 });
  const access = await requireWorkspaceAccess(session.user.id, job.workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (job.status !== "outdated") {
    return NextResponse.json({ error: "JOB_NOT_OUTDATED" }, { status: 409 });
  }
  const fresh = await buildAgentContext(job.taskId, job.workspaceId);
  let updated: typeof agentJobs.$inferSelect | null;
  try {
    updated = await db.transaction(async (tx) => {
      // Re-queue only if the job is still outdated (a concurrent cancel or
      // refresh wins); the partial unique index rejects re-queueing while another
      // active job exists for the same task.
      const [row] = await tx.update(agentJobs).set({
        status: "queued",
        contextVersion: job.contextVersion + 1,
        contextHash: fresh.contextHash,
        contextSnapshot: fresh.snapshot,
        planVersionId: fresh.planVersionId,
        repositoryId: fresh.repository.id,
        claimedByClient: null,
        claimedByTokenId: null,
        claimedAt: null,
        startedAt: null,
        submittedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(agentJobs.id, id), eq(agentJobs.status, "outdated"))).returning();
      if (!row) return null;
      await tx.update(agentJobSubmissions).set({
        reviewStatus: "superseded",
        reviewNote: "The plan context changed before review.",
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
      }).where(and(
        eq(agentJobSubmissions.jobId, id),
        eq(agentJobSubmissions.reviewStatus, "pending")
      ));
      await tx.insert(agentJobEvents).values({
        jobId: id,
        workspaceId: job.workspaceId,
        type: "context_refreshed",
        message: "The user approved a refreshed agent brief.",
        metadata: { contextVersion: row.contextVersion, contextHash: row.contextHash },
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, AGENT_JOB_ACTIVE_UNIQUE_INDEX)) {
      return NextResponse.json({ error: "ACTIVE_AGENT_JOB_EXISTS" }, { status: 409 });
    }
    throw error;
  }
  if (!updated) return NextResponse.json({ error: "JOB_NOT_OUTDATED" }, { status: 409 });
  await writeAuditLog({
    userId: session.user.id,
    workspaceId: job.workspaceId,
    event: "agent.context_refreshed",
    metadata: { jobId: id, contextVersion: updated.contextVersion },
    request,
  });
  return NextResponse.json({ job: updated });
}
