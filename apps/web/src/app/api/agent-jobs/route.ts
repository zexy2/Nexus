import { NextRequest, NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { agentJobs, tasks } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { getAccessibleWorkspaceIds, requireWorkspaceAccess } from "@/lib/workspace-auth";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const workspaceIds = requestedWorkspaceId
    ? await requireWorkspaceAccess(session.user.id, requestedWorkspaceId).then((access) => access.ok ? [access.workspaceId] : [])
    : await getAccessibleWorkspaceIds(session.user.id);
  if (workspaceIds.length === 0) return NextResponse.json([]);

  const jobs = await db.query.agentJobs.findMany({
    where: inArray(agentJobs.workspaceId, workspaceIds),
    orderBy: [desc(agentJobs.createdAt)],
    limit: 100,
  });
  const taskRows = jobs.length > 0
    ? await db.select().from(tasks).where(inArray(tasks.id, jobs.map((job) => job.taskId)))
    : [];
  const taskById = new Map(taskRows.map((task) => [task.id, task]));
  return NextResponse.json(jobs.map((job) => ({ ...job, task: taskById.get(job.taskId) || null })));
}
