import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { externalCheckRuns, externalPullRequests } from "@nexus/database/schema";
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

  const prs = await db.query.externalPullRequests.findMany({
    where: eq(externalPullRequests.workspaceId, access.workspaceId),
  });
  const prIds = prs.map((pullRequest) => pullRequest.id);
  const checks = prIds.length > 0
    ? await db.query.externalCheckRuns.findMany({
        where: inArray(externalCheckRuns.pullRequestId, prIds),
      })
    : [];
  const checksByPr = new Map<string, typeof checks>();
  for (const check of checks) {
    const current = checksByPr.get(check.pullRequestId) || [];
    current.push(check);
    checksByPr.set(check.pullRequestId, current);
  }

  return NextResponse.json(prs.map((pullRequest) => ({
    id: pullRequest.id,
    externalId: pullRequest.externalId,
    number: pullRequest.number,
    title: pullRequest.title,
    status: pullRequest.status,
    url: pullRequest.url,
    branch: pullRequest.branch,
    baseBranch: pullRequest.baseBranch,
    latestCommitSha: pullRequest.latestCommitSha,
    linkedExternalIssueIds: pullRequest.linkedExternalIssueIds,
    changedFiles: pullRequest.changedFiles,
    checks: (checksByPr.get(pullRequest.id) || []).map((check) => ({
      id: check.id,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      url: check.url,
    })),
    syncedAt: pullRequest.syncedAt?.toISOString() || null,
  })));
}
