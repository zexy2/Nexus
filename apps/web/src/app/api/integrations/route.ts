import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceAccess, ensureDefaultWorkspace } from "@/lib/workspace-auth";
import {
  getIntegrationProviderConfig,
  listWorkspaceIntegrations,
} from "@/lib/integrations/impact-graph";

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

  const integrations = await listWorkspaceIntegrations(access.workspaceId);
  return NextResponse.json({
    integrations,
    providers: {
      github: getIntegrationProviderConfig("github"),
      linear: getIntegrationProviderConfig("linear"),
    },
  });
}
