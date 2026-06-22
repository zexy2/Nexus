import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { workspaceRepositories } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { ensureDefaultWorkspace, requireWorkspaceOwner } from "@/lib/workspace-auth";
import { parseGitHubRepository } from "@/lib/agent-handoff";
import { isDemoEmail, writeAuditLog } from "@/lib/production-guardrails";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = request.nextUrl.searchParams.get("workspaceId");
  const workspaceId = requested || (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceOwner(session.user.id, workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const repository = await db.query.workspaceRepositories.findFirst({
    where: eq(workspaceRepositories.workspaceId, workspaceId),
  });
  return NextResponse.json({ workspaceId, repository });
}

export async function PUT(request: NextRequest) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoEmail(session.user.email)) {
    return NextResponse.json(
      { error: "DEMO_AGENT_SETTINGS_READ_ONLY", message: "Agent settings are read-only for temporary demo sessions." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId
    : (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceOwner(session.user.id, workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = parseGitHubRepository(typeof body.repositoryUrl === "string" ? body.repositoryUrl : "");
  const defaultBranch = typeof body.defaultBranch === "string" ? body.defaultBranch.trim() : "main";
  if (!parsed || !/^[A-Za-z0-9._/-]{1,255}$/.test(defaultBranch)) {
    return NextResponse.json(
      { error: "INVALID_REPOSITORY", message: "Provide a valid GitHub repository and base branch." },
      { status: 400 }
    );
  }

  const [repository] = await db
    .insert(workspaceRepositories)
    .values({
      workspaceId,
      repositoryUrl: parsed.url,
      repositoryOwner: parsed.owner,
      repositoryName: parsed.name,
      defaultBranch,
      createdBy: session.user.id,
    })
    .onConflictDoUpdate({
      target: workspaceRepositories.workspaceId,
      set: {
        repositoryUrl: parsed.url,
        repositoryOwner: parsed.owner,
        repositoryName: parsed.name,
        defaultBranch,
        updatedAt: new Date(),
      },
    })
    .returning();

  await writeAuditLog({
    userId: session.user.id,
    workspaceId,
    event: "agent.repository_configured",
    metadata: { repository: parsed.url, defaultBranch },
    request,
  });
  return NextResponse.json({ repository });
}
