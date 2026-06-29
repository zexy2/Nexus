import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner } from "@/lib/workspace-auth";
import { IntegrationSyncError, updateIntegrationConfig } from "@/lib/integrations/sync";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}));
  const selectedRepository =
    typeof body.selectedRepository === "string" ? body.selectedRepository : undefined;
  const selectedTeamId = typeof body.selectedTeamId === "string" ? body.selectedTeamId : undefined;
  const selectedProjectId =
    "selectedProjectId" in body
      ? typeof body.selectedProjectId === "string"
        ? body.selectedProjectId
        : null
      : undefined;

  try {
    const metadata = await updateIntegrationConfig(integration.id, {
      selectedRepository,
      selectedTeamId,
      selectedProjectId,
    });
    return NextResponse.json({ ok: true, metadata });
  } catch (error) {
    if (error instanceof IntegrationSyncError) {
      return NextResponse.json(
        { error: error.code, message: error.message, metadata: error.metadata },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "INTEGRATION_CONFIG_FAILED", message: error instanceof Error ? error.message : "Config update failed." },
      { status: 500 }
    );
  }
}
