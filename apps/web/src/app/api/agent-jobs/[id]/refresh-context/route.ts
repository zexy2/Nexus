import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { agentJobEvents, agentJobs, agentJobSubmissions } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { buildAgentContext } from "@/lib/agent-handoff";
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
  const updated = await db.transaction(async (tx) => {
    await tx.update(agentJobSubmissions).set({
      reviewStatus: "superseded",
      reviewNote: "The plan context changed before review.",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    }).where(and(
      eq(agentJobSubmissions.jobId, id),
      eq(agentJobSubmissions.reviewStatus, "pending")
    ));
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
    }).where(eq(agentJobs.id, id)).returning();
    await tx.insert(agentJobEvents).values({
      jobId: id,
      workspaceId: job.workspaceId,
      type: "context_refreshed",
      message: "The user approved a refreshed agent brief.",
      metadata: { contextVersion: row.contextVersion, contextHash: row.contextHash },
    });
    return row;
  });
  await writeAuditLog({
    userId: session.user.id,
    workspaceId: job.workspaceId,
    event: "agent.context_refreshed",
    metadata: { jobId: id, contextVersion: updated.contextVersion },
    request,
  });
  return NextResponse.json({ job: updated });
}
