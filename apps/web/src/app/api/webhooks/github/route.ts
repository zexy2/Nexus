import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/integrations/crypto";
import {
  claimWebhookDelivery,
  processWebhookDeliveryAfterResponse,
} from "@/lib/integrations/webhook-delivery";

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

// Events that carry no repository state; acknowledged without a sync.
const NON_SYNC_EVENTS = new Set(["ping"]);

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

  const shouldSync = Boolean(integration) && !NON_SYNC_EVENTS.has(eventType);
  const metadata = {
    action: payload.action,
    repository: payload.repository?.full_name,
    installationId,
  };
  const claim = await claimWebhookDelivery({
    workspaceId: integration?.workspaceId,
    integrationId: integration?.id,
    provider: "github",
    deliveryId,
    eventType,
    status: shouldSync ? "queued" : "ignored",
    rawMetadataHash: sha256Hex(rawBody),
    metadata,
    processedAt: shouldSync ? null : new Date(),
  });

  if (claim.kind === "duplicate") {
    return NextResponse.json({ ok: true, status: "duplicate", event: eventType });
  }

  if (!shouldSync || !integration) {
    return NextResponse.json({ ok: true, status: "ignored", event: eventType });
  }

  // A full repository sync can take far longer than GitHub's 10s delivery
  // timeout, so acknowledge now and sync after the response. A failed sync is
  // recorded as "failed" and is reprocessed when the delivery is redelivered.
  processWebhookDeliveryAfterResponse({
    eventId: claim.id,
    integrationId: integration.id,
    metadata,
    fallbackError: "GitHub sync failed",
  });

  return NextResponse.json(
    { ok: true, status: "accepted", event: eventType, redelivery: claim.redelivery },
    { status: 202 }
  );
}
