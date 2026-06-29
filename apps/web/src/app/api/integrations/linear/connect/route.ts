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

  const config = getIntegrationProviderConfig("linear");
  if (!config.configured) {
    return NextResponse.json(
      {
        error: "LINEAR_OAUTH_NOT_CONFIGURED",
        message: "Linear OAuth is not configured on this server.",
        missing: config.missing,
      },
      { status: 503 }
    );
  }

  const appUrl = getCanonicalAppUrl(request.nextUrl.origin);
  const redirectUri =
    process.env.LINEAR_REDIRECT_URI ||
    new URL("/api/integrations/linear/callback", appUrl).toString();
  const state = await createIntegrationConnectState({
    provider: "linear",
    workspaceId,
    userId: session.user.id,
  });
  const authUrl = new URL("https://linear.app/oauth/authorize");
  authUrl.searchParams.set("client_id", process.env.LINEAR_CLIENT_ID || "");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "read,write");
  authUrl.searchParams.set("state", state);

  return NextResponse.json({
    ok: true,
    authUrl: authUrl.toString(),
  });
}
