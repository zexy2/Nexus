import { NextRequest, NextResponse } from "next/server";
import {
  getCanonicalAppUrl,
  readIntegrationConnectState,
  updateIntegrationConnectStateMetadata,
} from "@/lib/integrations/crypto";
import { getGitHubAppConfig } from "@/lib/integrations/providers/github-client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const installationId = request.nextUrl.searchParams.get("installation_id");
  const setupAction = request.nextUrl.searchParams.get("setup_action");

  if (!state || !installationId) {
    return NextResponse.json(
      { error: "INVALID_GITHUB_SETUP", message: "GitHub setup callback is missing state or installation_id." },
      { status: 400 }
    );
  }

  const connectState = await readIntegrationConnectState("github", state);
  if (!connectState) {
    return NextResponse.json(
      { error: "INVALID_CONNECT_STATE", message: "GitHub connect state is invalid or expired." },
      { status: 400 }
    );
  }

  await updateIntegrationConnectStateMetadata(connectState, {
    githubInstallationId: installationId,
    setupAction,
  });

  const { clientId } = getGitHubAppConfig();
  const appUrl = getCanonicalAppUrl(request.nextUrl.origin);
  const callbackUrl = new URL("/api/integrations/github/callback", appUrl);
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
