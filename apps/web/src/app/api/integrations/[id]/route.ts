import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner } from "@/lib/workspace-auth";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const integration = await db.query.workspaceIntegrations.findFirst({
    where: eq(workspaceIntegrations.id, id),
  });
  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const access = await requireWorkspaceOwner(session.user.id, integration.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  await db.delete(workspaceIntegrations).where(eq(workspaceIntegrations.id, id));
  return NextResponse.json({ ok: true });
}
