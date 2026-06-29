import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/api-middleware";
import { requireWorkspaceOwner, ensureDefaultWorkspace } from "@/lib/workspace-auth";
import { getIntegrationProviderConfig } from "@/lib/integrations/impact-graph";
import { isDemoEmail } from "@/lib/production-guardrails";
import { createIntegrationConnectState, getCanonicalAppUrl } from "@/lib/integrations/crypto";

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
  const appSlug = process.env.GITHUB_APP_SLUG;
  if (!config.configured || !appSlug) {
    return NextResponse.json(
      {
        error: "GITHUB_APP_NOT_CONFIGURED",
        message: "GitHub App installation is not configured on this server.",
        missing: appSlug ? config.missing : [...config.missing, "GITHUB_APP_SLUG"],
      },
      { status: 503 }
    );
  }

  const state = await createIntegrationConnectState({
    provider: "github",
    workspaceId,
    userId: session.user.id,
    metadata: { stage: "install" },
  });
  const appUrl = getCanonicalAppUrl(request.nextUrl.origin);
  const setupUrl = new URL("/api/integrations/github/setup", appUrl);

  return NextResponse.json({
    ok: true,
    installUrl: `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}&redirect_url=${encodeURIComponent(setupUrl.toString())}`,
  });
}
