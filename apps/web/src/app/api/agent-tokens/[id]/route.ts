import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { agentAccessTokens } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { writeAuditLog } from "@/lib/production-guardrails";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const [revoked] = await db.update(agentAccessTokens).set({ revokedAt: new Date() }).where(and(
    eq(agentAccessTokens.id, id),
    eq(agentAccessTokens.userId, session.user.id)
  )).returning();
  if (!revoked) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  await writeAuditLog({
    userId: session.user.id,
    workspaceId: revoked.workspaceId,
    event: "agent.token_revoked",
    metadata: { tokenId: id },
    request,
  });
  return NextResponse.json({ ok: true });
}
