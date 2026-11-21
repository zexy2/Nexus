import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { getCanonicalAppUrl } from "@/lib/integrations/crypto";
import {
  authorizeIntegrationConnectState,
  claimIntegrationConnectState,
} from "@/lib/integrations/connect-state-guard";
import {
  buildGitHubReconnectMetadata,
  selectedRepositoryFullName,
} from "@/lib/integrations/github-reconnect";
import {
  exchangeGitHubOAuthCode,
  getGitHubAppConfig,
  listGitHubInstallationsForUser,
  listInstallationRepositories,
  verifyGitHubInstallationForUser,
} from "@/lib/integrations/providers/github-client";

export const runtime = "nodejs";

function redirectToSettings(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/dashboard/settings", getCanonicalAppUrl(request.nextUrl.origin));
  url.searchParams.set("tab", "integrations");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

function buildGitHubInstallUrl(request: NextRequest, state: string) {
  const { appSlug } = getGitHubAppConfig();
  const appUrl = getCanonicalAppUrl(request.nextUrl.origin);
  const setupUrl = new URL("/api/integrations/github/setup", appUrl);
  return `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}&redirect_url=${encodeURIComponent(setupUrl.toString())}`;
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

  // Session user must be the user who started the flow and still own the
  // target workspace. The state is only claimed right before persisting,
  // because a first-time install round-trips through GitHub with it.
  const authorization = await authorizeIntegrationConnectState("github", state, { consume: false });
  if (!authorization.ok) {
    return redirectToSettings(request, {
      integration: "github",
      error: authorization.error,
    });
  }
  const connectState = authorization.connectState;

  try {
    const callbackUrl = new URL(
      "/api/integrations/github/callback",
      getCanonicalAppUrl(request.nextUrl.origin)
    );
    const accessToken = await exchangeGitHubOAuthCode(code, callbackUrl.toString());

    let installationId =
      typeof connectState.metadata?.githubInstallationId === "string"
        ? connectState.metadata.githubInstallationId
        : null;
    let installation: { id: number; account?: { login?: string } } | null = null;

    if (installationId) {
      installation = await verifyGitHubInstallationForUser(accessToken, installationId);
      if (!installation) {
        return redirectToSettings(request, {
          integration: "github",
          error: "installation_not_verified",
        });
      }
    } else {
      const { appId, appSlug } = getGitHubAppConfig();
      const appInstallations = (await listGitHubInstallationsForUser(accessToken)).filter((candidate) => {
        return candidate.app_id === Number(appId) || candidate.app_slug === appSlug;
      });

      if (appInstallations.length === 0) {
        return NextResponse.redirect(buildGitHubInstallUrl(request, state));
      }

      if (appInstallations.length > 1) {
        return redirectToSettings(request, {
          integration: "github",
          error: "multiple_installations",
        });
      }

      installation = appInstallations[0];
      installationId = String(installation.id);
    }

    // One-time use: claim atomically before writing, so a replayed or
    // concurrent callback with the same state cannot link again.
    const claimed = await claimIntegrationConnectState("github", state, authorization.userId);
    if (!claimed) {
      return redirectToSettings(request, {
        integration: "github",
        error: "invalid_state",
      });
    }

    // Keep the repository selection across a reconnect when the
    // installation can still access it; otherwise every approved write would
    // fail until the owner re-selects the repository.
    const previous = await db.query.workspaceIntegrations.findFirst({
      where: and(
        eq(workspaceIntegrations.workspaceId, connectState.workspaceId),
        eq(workspaceIntegrations.provider, "github")
      ),
      columns: { installationId: true, metadata: true },
    });
    let accessibleRepositories: Awaited<ReturnType<typeof listInstallationRepositories>> | null = null;
    if (previous && selectedRepositoryFullName(previous.metadata)) {
      try {
        accessibleRepositories = await listInstallationRepositories(installationId);
      } catch (error) {
        console.warn("[GitHub] Could not verify repository access on reconnect:", error);
      }
    }
    const metadata = buildGitHubReconnectMetadata({
      base: {
        setupVerifiedAt: new Date().toISOString(),
        accountLogin: installation.account?.login,
        connectMode: connectState.metadata?.githubInstallationId ? "setup_callback" : "existing_installation",
      },
      previousMetadata: previous?.metadata,
      previousInstallationId: previous?.installationId,
      installationId,
      accessibleRepositories,
    });

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
        metadata,
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
          metadata,
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
