import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { tasks } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { createAgentJob } from "@/lib/agent-handoff";
import { isDemoEmail, writeAuditLog } from "@/lib/production-guardrails";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoEmail(session.user.email)) {
    return NextResponse.json({ error: "DEMO_AGENT_HANDOFF_READ_ONLY" }, { status: 403 });
  }
  const { id } = await context.params;
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  const access = await requireWorkspaceAccess(session.user.id, task.workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const job = await createAgentJob(id, task.workspaceId, session.user.id);
    await writeAuditLog({
      userId: session.user.id,
      workspaceId: task.workspaceId,
      event: "agent.job_dispatched",
      metadata: { jobId: job.id, taskId: id, contextHash: job.contextHash },
      request,
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AGENT_JOB_CREATE_FAILED";
    const status = code === "REPOSITORY_NOT_CONFIGURED" || code === "ACTIVE_AGENT_JOB_EXISTS" ? 409 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
