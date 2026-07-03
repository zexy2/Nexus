import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner, ensureDefaultWorkspace } from "@/lib/workspace-auth";
import { getIntegrationProviderConfig } from "@/lib/integrations/impact-graph";
import { isDemoEmail } from "@/lib/production-guardrails";
import { createIntegrationConnectState, getCanonicalAppUrl } from "@/lib/integrations/crypto";
import { getGitHubAppConfig } from "@/lib/integrations/providers/github-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isDemoEmail(session.user.email)) {
    return NextResponse.json(
      { error: "DEMO_INTEGRATION_DISABLED", message: "Demo users cannot connect real integrations." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = typeof body.workspaceId === "string"
    ? body.workspaceId
    : (await ensureDefaultWorkspace(session.user.id)).id;
  const access = await requireWorkspaceOwner(session.user.id, workspaceId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const config = getIntegrationProviderConfig("github");
  if (!config.configured) {
    return NextResponse.json(
      {
        error: "GITHUB_APP_NOT_CONFIGURED",
        message: "GitHub App installation is not configured on this server.",
        missing: config.missing,
      },
      { status: 503 }
    );
  }

  const { clientId } = getGitHubAppConfig();

  const state = await createIntegrationConnectState({
    provider: "github",
    workspaceId,
    userId: session.user.id,
    metadata: { stage: "oauth" },
  });
  const appUrl = getCanonicalAppUrl(request.nextUrl.origin);
  const callbackUrl = new URL("/api/integrations/github/callback", appUrl);
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authUrl.searchParams.set("state", state);

  return NextResponse.json({
    ok: true,
    authUrl: authUrl.toString(),
  });
}
