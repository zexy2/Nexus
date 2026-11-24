import { and, eq, or, sql } from "drizzle-orm";
import { integrationWebhookEvents } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { runAfterResponse } from "@/lib/background";
import { syncIntegrationById } from "@/lib/integrations/sync";
import { scheduleCoalesced } from "@/lib/integrations/sync-coalescer";

/**
 * A "queued" delivery whose last claim is older than this is considered
 * abandoned (process recycled mid-sync) and may be claimed by a redelivery.
 */
export const WEBHOOK_CLAIM_STALE_MS = 15 * 60_000;

type WebhookEventInsert = typeof integrationWebhookEvents.$inferInsert;

type WebhookClaim =
  | { kind: "claimed"; id: string; redelivery: boolean }
  | { kind: "duplicate" };

/**
 * Records a delivery and decides whether this request should process it.
 *
 * - New delivery id: inserted and claimed.
 * - Known delivery id that previously failed (or whose claim went stale):
 *   re-claimed with a conditional UPDATE, so exactly one concurrent redelivery
 *   wins and the event is reprocessed.
 * - Known delivery id that completed, was ignored, or is being processed right
 *   now: reported as a duplicate.
 */
export async function claimWebhookDelivery(values: WebhookEventInsert): Promise<WebhookClaim> {
  const now = new Date();
  const processable = values.status === "queued";
  const [inserted] = await db
    .insert(integrationWebhookEvents)
    .values({ ...values, lastAttemptAt: processable ? now : null })
    .onConflictDoNothing()
    .returning({ id: integrationWebhookEvents.id });
  if (inserted) return { kind: "claimed", id: inserted.id, redelivery: false };
  if (!processable) return { kind: "duplicate" };

  const staleBefore = new Date(now.getTime() - WEBHOOK_CLAIM_STALE_MS);
  const [reclaimed] = await db
    .update(integrationWebhookEvents)
    .set({
      status: "queued",
      workspaceId: values.workspaceId,
      integrationId: values.integrationId,
      eventType: values.eventType,
      rawMetadataHash: values.rawMetadataHash,
      metadata: values.metadata,
      processedAt: null,
      lastAttemptAt: now,
    })
    .where(
      and(
        eq(integrationWebhookEvents.provider, values.provider),
        eq(integrationWebhookEvents.deliveryId, values.deliveryId),
        or(
          eq(integrationWebhookEvents.status, "failed"),
          and(
            eq(integrationWebhookEvents.status, "queued"),
            sql`coalesce(${integrationWebhookEvents.lastAttemptAt}, ${integrationWebhookEvents.createdAt}) < ${staleBefore.toISOString()}::timestamptz`
          )
        )
      )
    )
    .returning({ id: integrationWebhookEvents.id });
  return reclaimed ? { kind: "claimed", id: reclaimed.id, redelivery: true } : { kind: "duplicate" };
}

/**
 * Runs the (coalesced) integration sync for a claimed delivery and records the
 * outcome on the delivery row. Never throws.
 */
async function processWebhookDelivery(input: {
  eventId: string;
  integrationId: string;
  metadata: Record<string, unknown>;
  fallbackError: string;
}) {
  try {
    await scheduleCoalesced(`integration-sync:${input.integrationId}`, () =>
      syncIntegrationById(input.integrationId)
    );
    await db
      .update(integrationWebhookEvents)
      .set({ status: "completed", processedAt: new Date() })
      .where(eq(integrationWebhookEvents.id, input.eventId));
    return { ok: true as const };
  } catch (error) {
    await db
      .update(integrationWebhookEvents)
      .set({
        status: "failed",
        processedAt: new Date(),
        metadata: {
          ...input.metadata,
          error: error instanceof Error ? error.message : input.fallbackError,
        },
      })
      .where(eq(integrationWebhookEvents.id, input.eventId))
      .catch((updateError) => {
        console.error("[webhooks] Failed to record delivery failure:", updateError);
      });
    return { ok: false as const };
  }
}

/** Schedules `processWebhookDelivery` to run after the response is sent. */
export function processWebhookDeliveryAfterResponse(input: Parameters<typeof processWebhookDelivery>[0]) {
  runAfterResponse(`webhook sync ${input.integrationId}`, () => processWebhookDelivery(input));
}
