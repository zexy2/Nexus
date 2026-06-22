import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { agentAccessTokens, workspaceRepositories } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { ensureDefaultWorkspace, requireWorkspaceOwner } from "@/lib/workspace-auth";
import { generateAgentToken } from "@/lib/agent-handoff";
import { isDemoEmail, writeAuditLog } from "@/lib/production-guardrails";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ||
    (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceOwner(session.user.id, workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const tokens = await db.query.agentAccessTokens.findMany({
    where: and(eq(agentAccessTokens.workspaceId, workspaceId), eq(agentAccessTokens.userId, session.user.id)),
    orderBy: [desc(agentAccessTokens.createdAt)],
  });
  return NextResponse.json(tokens.map((token) => ({
    id: token.id,
    name: token.name,
    prefix: token.tokenPrefix,
    scopes: token.scopes,
    expiresAt: token.expiresAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() || null,
    revokedAt: token.revokedAt?.toISOString() || null,
    createdAt: token.createdAt.toISOString(),
  })));
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isDemoEmail(session.user.email)) {
    return NextResponse.json(
      { error: "DEMO_TOKEN_DISABLED", message: "Agent tokens are disabled for temporary demo sessions." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId
    : (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceOwner(session.user.id, workspaceId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const repository = await db.query.workspaceRepositories.findFirst({
    where: eq(workspaceRepositories.workspaceId, workspaceId),
  });
  if (!repository) {
    return NextResponse.json({ error: "REPOSITORY_NOT_CONFIGURED" }, { status: 409 });
  }

  const name = typeof body.name === "string" && body.name.trim()
    ? body.name.trim().slice(0, 120)
    : "Local coding agent";
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const generated = generateAgentToken();
  const [created] = await db.insert(agentAccessTokens).values({
    workspaceId,
    userId: session.user.id,
    name,
    tokenPrefix: generated.prefix,
    tokenHash: generated.hash,
    scopes: ["agent:read", "agent:write"],
    expiresAt,
  }).returning();

  await writeAuditLog({
    userId: session.user.id,
    workspaceId,
    event: "agent.token_created",
    metadata: { tokenId: created.id, name },
    request,
  });
  return NextResponse.json({
    id: created.id,
    token: generated.token,
    prefix: generated.prefix,
    expiresAt: expiresAt.toISOString(),
  }, { status: 201 });
}
