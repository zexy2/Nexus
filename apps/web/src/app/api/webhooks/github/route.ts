import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { integrationWebhookEvents, workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/integrations/crypto";
import { syncIntegrationById } from "@/lib/integrations/sync";

export const runtime = "nodejs";

function verifyGitHubSignature(secret: string, rawBody: string, signature: string | null) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

type GitHubWebhookPayload = {
  installation?: { id?: number };
  repository?: { full_name?: string };
  action?: string;
};

export async function POST(request: NextRequest) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: "GITHUB_WEBHOOK_NOT_CONFIGURED",
        message: "GitHub webhook secret is not configured on this server.",
      },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid GitHub webhook signature" }, { status: 401 });
  }

  const deliveryId = request.headers.get("x-github-delivery") || sha256Hex(rawBody);
  const eventType = request.headers.get("x-github-event") || "unknown";
  let payload: GitHubWebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as GitHubWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid GitHub webhook JSON" }, { status: 400 });
  }
  const installationId = payload.installation?.id ? String(payload.installation.id) : null;
  const integration = installationId
    ? await db.query.workspaceIntegrations.findFirst({
        where: eq(workspaceIntegrations.installationId, installationId),
      })
    : null;

  const [webhookEvent] = await db
    .insert(integrationWebhookEvents)
    .values({
      workspaceId: integration?.workspaceId,
      integrationId: integration?.id,
      provider: "github",
      deliveryId,
      eventType,
      status: integration ? "queued" : "ignored",
      rawMetadataHash: sha256Hex(rawBody),
      metadata: {
        action: payload.action,
        repository: payload.repository?.full_name,
        installationId,
      },
      processedAt: integration ? null : new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: integrationWebhookEvents.id });

  if (!webhookEvent) {
    return NextResponse.json({ ok: true, status: "duplicate", event: eventType });
  }

  if (integration) {
    try {
      await syncIntegrationById(integration.id);
      await db
        .update(integrationWebhookEvents)
        .set({ status: "completed", processedAt: new Date() })
        .where(eq(integrationWebhookEvents.id, webhookEvent.id));
    } catch (error) {
      await db
        .update(integrationWebhookEvents)
        .set({
          status: "failed",
          processedAt: new Date(),
          metadata: {
            action: payload.action,
            repository: payload.repository?.full_name,
            installationId,
            error: error instanceof Error ? error.message : "GitHub sync failed",
          },
        })
        .where(eq(integrationWebhookEvents.id, webhookEvent.id));
      return NextResponse.json({ ok: false, status: "failed", event: eventType }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    status: integration ? "completed" : "ignored",
    event: eventType,
  });
}
