import { NextRequest, NextResponse } from "next/server";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { consumeIntegrationConnectState, getCanonicalAppUrl } from "@/lib/integrations/crypto";
import {
  exchangeLinearOAuthCode,
  getLinearViewer,
  listLinearResources,
  resolveLinearAccessToken,
} from "@/lib/integrations/providers/linear-client";

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
      integration: "linear",
      error: "missing_callback_params",
    });
  }

  const connectState = await consumeIntegrationConnectState("linear", state);
  if (!connectState) {
    return redirectToSettings(request, {
      integration: "linear",
      error: "invalid_state",
    });
  }

  try {
    const callbackUrl =
      process.env.LINEAR_REDIRECT_URI ||
      new URL("/api/integrations/linear/callback", getCanonicalAppUrl(request.nextUrl.origin)).toString();
    const tokenCiphertext = await exchangeLinearOAuthCode(code, callbackUrl);
    const token = await resolveLinearAccessToken(tokenCiphertext);
    const [viewerData, resources] = await Promise.all([
      getLinearViewer(token.accessToken),
      listLinearResources(token.accessToken),
    ]);
    const selectedTeamId = resources.teams.length === 1 ? resources.teams[0].id : null;
    const status = selectedTeamId ? "connected" : "needs_config";
    const organization = viewerData.viewer.organization;

    await db
      .insert(workspaceIntegrations)
      .values({
        workspaceId: connectState.workspaceId,
        provider: "linear",
        status,
        externalAccountId: organization.id,
        externalAccountName: organization.name,
        tokenCiphertext: token.encrypted || tokenCiphertext,
        scopes: ["read", "write"],
        metadata: {
          organization,
          viewer: {
            id: viewerData.viewer.id,
            name: viewerData.viewer.name,
            email: viewerData.viewer.email,
          },
          resources,
          selectedTeamId,
        },
        lastError: selectedTeamId ? null : "Select a Linear team before syncing.",
        createdBy: connectState.userId,
      })
      .onConflictDoUpdate({
        target: [workspaceIntegrations.workspaceId, workspaceIntegrations.provider],
        set: {
          status,
          externalAccountId: organization.id,
          externalAccountName: organization.name,
          tokenCiphertext: token.encrypted || tokenCiphertext,
          scopes: ["read", "write"],
          metadata: {
            organization,
            viewer: {
              id: viewerData.viewer.id,
              name: viewerData.viewer.name,
              email: viewerData.viewer.email,
            },
            resources,
            selectedTeamId,
          },
          lastError: selectedTeamId ? null : "Select a Linear team before syncing.",
          updatedAt: new Date(),
        },
      });

    return redirectToSettings(request, { integration: "linear", connected: "true" });
  } catch (error) {
    return redirectToSettings(request, {
      integration: "linear",
      error: error instanceof Error ? error.message : "linear_callback_failed",
    });
  }
}
