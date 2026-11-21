import { NextRequest, NextResponse } from "next/server";
import {
  getCanonicalAppUrl,
  updateIntegrationConnectStateMetadata,
} from "@/lib/integrations/crypto";
import { authorizeIntegrationConnectState } from "@/lib/integrations/connect-state-guard";
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

  // Only the user who started the connect flow may attach an installation id
  // to its state (and only while they still own the workspace).
  const authorization = await authorizeIntegrationConnectState("github", state, { consume: false });
  if (!authorization.ok) {
    if (authorization.error === "not_authenticated") {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Sign in to Nexus before completing the GitHub setup." },
        { status: 401 }
      );
    }
    if (authorization.error === "invalid_state") {
      return NextResponse.json(
        { error: "INVALID_CONNECT_STATE", message: "GitHub connect state is invalid or expired." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "CONNECT_STATE_FORBIDDEN", message: "This GitHub connect link belongs to a different user." },
      { status: 403 }
    );
  }
  const connectState = authorization.connectState;

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
