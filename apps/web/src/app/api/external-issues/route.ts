import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { externalIssues } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { ensureDefaultWorkspace, requireWorkspaceAccess } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  const workspaceId = requestedWorkspaceId || (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceAccess(session.user.id, workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.externalIssues.findMany({
    where: eq(externalIssues.workspaceId, access.workspaceId),
  });

  return NextResponse.json(rows.map((issue) => ({
    id: issue.id,
    provider: issue.provider,
    externalId: issue.externalId,
    key: issue.externalKey,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    url: issue.url,
    taskId: issue.taskId,
    teamName: issue.teamName,
    projectName: issue.projectName,
    labels: issue.labels,
    syncedAt: issue.syncedAt?.toISOString() || null,
  })));
}
