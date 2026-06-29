import { NextRequest, NextResponse } from "next/server";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { consumeIntegrationConnectState, getCanonicalAppUrl } from "@/lib/integrations/crypto";
import {
  exchangeGitHubOAuthCode,
  verifyGitHubInstallationForUser,
} from "@/lib/integrations/providers/github-client";

export const runtime = "nodejs";

function redirectToSettings(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/dashboard/settings", getCanonicalAppUrl(request.nextUrl.origin));
  url.searchParams.set("tab", "integrations");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return redirectToSettings(request, {
      integration: "github",
      error: "missing_callback_params",
    });
  }

  const connectState = await consumeIntegrationConnectState("github", state);
  if (!connectState) {
    return redirectToSettings(request, {
      integration: "github",
      error: "invalid_state",
    });
  }

  const installationId = connectState.metadata?.githubInstallationId;
  if (typeof installationId !== "string") {
    return redirectToSettings(request, {
      integration: "github",
      error: "missing_installation",
    });
  }

  try {
    const callbackUrl = new URL(
      "/api/integrations/github/callback",
      getCanonicalAppUrl(request.nextUrl.origin)
    );
    const accessToken = await exchangeGitHubOAuthCode(code, callbackUrl.toString());
    const installation = await verifyGitHubInstallationForUser(accessToken, installationId);
    if (!installation) {
      return redirectToSettings(request, {
        integration: "github",
        error: "installation_not_verified",
      });
    }

    await db
      .insert(workspaceIntegrations)
      .values({
        workspaceId: connectState.workspaceId,
        provider: "github",
        status: "connected",
        externalAccountId: installation.account?.login || installationId,
        externalAccountName: installation.account?.login || "GitHub",
        installationId,
        scopes: ["metadata:read", "issues:write", "pull_requests:read", "checks:read", "contents:read"],
        metadata: {
          setupVerifiedAt: new Date().toISOString(),
          accountLogin: installation.account?.login,
        },
        createdBy: connectState.userId,
      })
      .onConflictDoUpdate({
        target: [workspaceIntegrations.workspaceId, workspaceIntegrations.provider],
        set: {
          status: "connected",
          externalAccountId: installation.account?.login || installationId,
          externalAccountName: installation.account?.login || "GitHub",
          installationId,
          scopes: ["metadata:read", "issues:write", "pull_requests:read", "checks:read", "contents:read"],
          metadata: {
            setupVerifiedAt: new Date().toISOString(),
            accountLogin: installation.account?.login,
          },
          lastError: null,
          updatedAt: new Date(),
        },
      });

    return redirectToSettings(request, { integration: "github", connected: "true" });
  } catch (error) {
    return redirectToSettings(request, {
      integration: "github",
      error: error instanceof Error ? error.message : "github_callback_failed",
    });
  }
}
