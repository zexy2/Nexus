import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { workspaceIntegrations } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/integrations/crypto";
import {
  claimWebhookDelivery,
  processWebhookDeliveryAfterResponse,
} from "@/lib/integrations/webhook-delivery";
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

/**
 * Linear signs the raw body: `Linear-Signature` = hex HMAC-SHA256(body).
 * See Linear developer docs, "Securing webhooks".
 */
function verifyLinearSignature(secret: string, rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeCompare(expected, signature.trim().toLowerCase());
}

/** Replay window for the signed `webhookTimestamp` (Linear recommends one minute). */
const LINEAR_TIMESTAMP_TOLERANCE_MS = 60_000;

type LinearWebhookPayload = {
  type?: string;
  action?: string;
  organizationId?: string;
  /** UNIX ms when Linear sent the webhook; covered by the signature. */
  webhookTimestamp?: number;
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

  if (!verifyLinearSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid Linear webhook signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody || "{}") as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid Linear webhook JSON" }, { status: 400 });
  }

  // Replay protection uses the timestamp INSIDE the signed body. Header
  // timestamps are not covered by Linear's signature, so an attacker could
  // replay an old signed body with a fresh header.
  const webhookTimestamp = Number(payload.webhookTimestamp);
  if (
    !Number.isFinite(webhookTimestamp) ||
    Math.abs(Date.now() - webhookTimestamp) > LINEAR_TIMESTAMP_TOLERANCE_MS
  ) {
    return NextResponse.json({ error: "Stale Linear webhook timestamp" }, { status: 401 });
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

  const metadata = {
    action: payload.action,
    organizationId: payload.organizationId,
    objectId: payload.data?.id,
    identifier: payload.data?.identifier,
    teamId: payload.data?.team?.id,
  };
  const claim = await claimWebhookDelivery({
    workspaceId: integration?.workspaceId,
    integrationId: integration?.id,
    provider: "linear",
    deliveryId,
    eventType: payload.type || payload.action || "unknown",
    status: integration ? "queued" : "ignored",
    rawMetadataHash: sha256Hex(rawBody),
    metadata,
    processedAt: integration ? null : new Date(),
  });

  if (claim.kind === "duplicate") {
    return NextResponse.json({ ok: true, status: "duplicate" });
  }

  if (!integration) {
    return NextResponse.json({ ok: true, status: "ignored" });
  }

  // Acknowledge within Linear's delivery timeout and sync after the response.
  // A failed sync is recorded as "failed" and is reprocessed on redelivery.
  processWebhookDeliveryAfterResponse({
    eventId: claim.id,
    integrationId: integration.id,
    metadata,
    fallbackError: "Linear sync failed",
  });

  return NextResponse.json(
    { ok: true, status: "accepted", redelivery: claim.redelivery },
    { status: 202 }
  );
}
