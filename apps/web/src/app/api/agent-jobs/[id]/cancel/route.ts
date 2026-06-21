import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { agentJobEvents, agentJobs } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { writeAuditLog } from "@/lib/production-guardrails";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const job = await db.query.agentJobs.findFirst({ where: eq(agentJobs.id, id) });
  if (!job) return NextResponse.json({ error: "Agent job not found" }, { status: 404 });
  const access = await requireWorkspaceAccess(session.user.id, job.workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const [cancelled] = await db.update(agentJobs).set({ status: "cancelled", completedAt: new Date() }).where(and(
    eq(agentJobs.id, id),
    inArray(agentJobs.status, ["queued", "claimed", "running", "outdated"])
  )).returning();
  if (!cancelled) return NextResponse.json({ error: "JOB_CANNOT_BE_CANCELLED" }, { status: 409 });
  await db.insert(agentJobEvents).values({ jobId: id, workspaceId: job.workspaceId, type: "cancelled" });
  await writeAuditLog({ userId: session.user.id, workspaceId: job.workspaceId, event: "agent.job_cancelled", metadata: { jobId: id }, request });
  return NextResponse.json({ job: cancelled });
}
