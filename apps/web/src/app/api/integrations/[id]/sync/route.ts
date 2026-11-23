import { logInternalError } from "@/lib/api-response";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess } from "@/lib/workspace-auth";
import { IntegrationSyncError, syncIntegrationById } from "@/lib/integrations/sync";

export const runtime = "nodejs";

export async function POST(
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

  const access = await requireWorkspaceAccess(session.user.id, integration.workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await syncIntegrationById(integration.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof IntegrationSyncError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          metadata: error.metadata,
        },
        { status: error.status }
      );
    }
    const requestId = logInternalError("Integration sync", error, _request.headers);
    return NextResponse.json(
      {
        error: "PROVIDER_API_FAILED",
        message: "Provider sync failed.",
        requestId,
      },
      { status: 502 }
    );
  }
}
