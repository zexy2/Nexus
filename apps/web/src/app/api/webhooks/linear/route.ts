import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { integrationWebhookEvents, workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/integrations/crypto";
import { syncIntegrationById } from "@/lib/integrations/sync";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

function safeCompare(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function verifyLinearSignature(
  secret: string,
  rawBody: string,
  signature: string | null,
  timestamp: string | null
) {
  if (!signature) return false;
  const plainExpected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (safeCompare(plainExpected, signature)) return true;

  if (timestamp) {
    const timestampedExpected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    return safeCompare(timestampedExpected, signature);
  }

  return false;
}

type LinearWebhookPayload = {
  type?: string;
  action?: string;
  organizationId?: string;
  data?: { id?: string; identifier?: string; team?: { id?: string } };
};

export async function POST(request: NextRequest) {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: "LINEAR_WEBHOOK_NOT_CONFIGURED",
        message: "Linear webhook secret is not configured on this server.",
      },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("linear-signature") ||
    request.headers.get("x-linear-signature");
  const timestamp =
    request.headers.get("webhook-timestamp") ||
    request.headers.get("linear-timestamp") ||
    request.headers.get("x-linear-timestamp");
  if (timestamp) {
    const numericTimestamp = Number(timestamp);
    const timestampMs = numericTimestamp < 1_000_000_000_000
      ? numericTimestamp * 1000
      : numericTimestamp;
    if (!Number.isFinite(numericTimestamp) || Math.abs(Date.now() - timestampMs) > 60_000) {
      return NextResponse.json({ error: "Stale Linear webhook timestamp" }, { status: 401 });
    }
  }

  if (!verifyLinearSignature(secret, rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid Linear webhook signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Linear webhook JSON" }, { status: 400 });
  }
  const deliveryId =
    request.headers.get("linear-delivery") ||
    request.headers.get("x-linear-delivery") ||
    sha256Hex(rawBody);
  const integration = payload.organizationId
    ? await db.query.workspaceIntegrations.findFirst({
        where: and(
          eq(workspaceIntegrations.provider, "linear"),
          eq(workspaceIntegrations.externalAccountId, payload.organizationId)
        ),
      })
    : null;

  const [webhookEvent] = await db
    .insert(integrationWebhookEvents)
    .values({
      workspaceId: integration?.workspaceId,
      integrationId: integration?.id,
      provider: "linear",
      deliveryId,
      eventType: payload.type || payload.action || "unknown",
      status: integration ? "queued" : "ignored",
      rawMetadataHash: sha256Hex(rawBody),
      metadata: {
        action: payload.action,
        organizationId: payload.organizationId,
        objectId: payload.data?.id,
        identifier: payload.data?.identifier,
        teamId: payload.data?.team?.id,
      },
      processedAt: integration ? null : new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: integrationWebhookEvents.id });

  if (!webhookEvent) {
    return NextResponse.json({ ok: true, status: "duplicate" });
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
            organizationId: payload.organizationId,
            objectId: payload.data?.id,
            identifier: payload.data?.identifier,
            teamId: payload.data?.team?.id,
            error: error instanceof Error ? error.message : "Linear sync failed",
          },
        })
        .where(eq(integrationWebhookEvents.id, webhookEvent.id));
      return NextResponse.json({ ok: false, status: "failed" }, { status: 502 });
    }
  }

  return NextResponse.json({
    ok: true,
    status: integration ? "completed" : "ignored",
  });
}
