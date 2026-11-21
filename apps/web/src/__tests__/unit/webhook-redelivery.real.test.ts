/**
 * Webhook deliveries: only successfully processed deliveries are deduplicated.
 * A delivery whose sync failed is recorded as "failed" and is reprocessed when
 * the provider redelivers it with the same delivery id.
 */
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

type EventRow = {
  id: string;
  provider: string;
  deliveryId: string;
  status: string;
  lastAttemptAt: Date | null;
  createdAt: Date;
  processedAt: Date | null;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
};

const store = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>>, nextId: 1 }));
const syncIntegration = vi.fn();

/**
 * Fake for integration_webhook_events honouring the unique (provider,
 * delivery_id) index, ON CONFLICT DO NOTHING, and the two UPDATE shapes the
 * delivery module issues: by id, and the guarded re-claim.
 */
vi.mock("@/lib/db", () => {
  const dialect = new PgDialect();
  const render = (where: SQL) => dialect.sqlToQuery(where);
  return {
    db: {
      query: {
        workspaceIntegrations: {
          findFirst: async () => ({ id: "integration-1", workspaceId: "workspace-1", provider: "github" }),
        },
      },
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              const clash = store.events.some(
                (row) => row.provider === values.provider && row.deliveryId === values.deliveryId
              );
              if (clash) return [];
              const row = { id: `event-${store.nextId++}`, createdAt: new Date(), ...values };
              store.events.push(row);
              return [{ id: row.id }];
            },
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: (where: SQL) => {
            const { sql, params } = render(where);
            const apply = () => {
              let matches: Array<Record<string, unknown>>;
              if (/ or /.test(sql)) {
                // Re-claim: provider = $1 and delivery_id = $2 and
                // (status = 'failed' or (status = 'queued' and last attempt < cutoff))
                expect(sql).toMatch(/"provider" = \$1 and "integration_webhook_events"\."delivery_id" = \$2/);
                const [provider, deliveryId, failed, queued, cutoff] = params as string[];
                expect([failed, queued]).toEqual(["failed", "queued"]);
                matches = store.events.filter((row) => {
                  const event = row as EventRow;
                  if (event.provider !== provider || event.deliveryId !== deliveryId) return false;
                  if (event.status === failed) return true;
                  const lastAttempt = (event.lastAttemptAt ?? event.createdAt).getTime();
                  return event.status === queued && lastAttempt < new Date(cutoff!).getTime();
                });
              } else {
                expect(sql).toBe('"integration_webhook_events"."id" = $1');
                matches = store.events.filter((row) => row.id === params[0]);
              }
              matches.forEach((row) => Object.assign(row, values));
              return matches.map((row) => ({ id: row.id }));
            };
            return {
              returning: async () => apply(),
              then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
                Promise.resolve().then(apply).then(() => undefined).then(resolve, reject),
              catch: () => Promise.resolve().then(apply),
            };
          },
        }),
      }),
    },
  };
});

vi.mock("@/lib/integrations/sync", () => ({
  syncIntegrationById: (...args: unknown[]) => syncIntegration(...args),
}));

import { POST as postGitHubWebhook } from "@/app/api/webhooks/github/route";
import { WEBHOOK_CLAIM_STALE_MS } from "@/lib/integrations/webhook-delivery";

const secret = "github-secret";
const body = JSON.stringify({ action: "opened", installation: { id: 123 }, repository: { full_name: "acme/app" } });

function deliver(deliveryId: string, event = "pull_request") {
  return postGitHubWebhook(
    new NextRequest("http://localhost:3000/api/webhooks/github", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
        "x-github-delivery": deliveryId,
        "x-github-event": event,
      },
      body,
    })
  );
}

const eventRow = (deliveryId: string) => store.events.find((row) => row.deliveryId === deliveryId) as EventRow;

async function settled(deliveryId: string) {
  await vi.waitFor(() => expect(["completed", "failed"]).toContain(eventRow(deliveryId).status));
}

beforeEach(() => {
  vi.clearAllMocks();
  store.events = [];
  store.nextId = 1;
  process.env.GITHUB_WEBHOOK_SECRET = secret;
});

describe("webhook delivery dedupe", () => {
  it("failed webhook redelivery reprocessed", async () => {
    syncIntegration.mockRejectedValueOnce(new Error("GitHub API failed: 502"));

    const first = await deliver("delivery-1");
    expect(first.status).toBe(202);
    await settled("delivery-1");
    expect(eventRow("delivery-1")).toMatchObject({
      status: "failed",
      metadata: expect.objectContaining({ error: "GitHub API failed: 502" }),
    });

    syncIntegration.mockResolvedValueOnce({ status: "completed" });
    const redelivery = await deliver("delivery-1");
    expect(redelivery.status).toBe(202);
    await expect(redelivery.json()).resolves.toMatchObject({ status: "accepted", redelivery: true });
    await settled("delivery-1");

    expect(syncIntegration).toHaveBeenCalledTimes(2);
    expect(eventRow("delivery-1").status).toBe("completed");
    expect(store.events).toHaveLength(1);
  });

  it("successful one deduped", async () => {
    syncIntegration.mockResolvedValue({ status: "completed" });

    await deliver("delivery-2");
    await settled("delivery-2");
    expect(eventRow("delivery-2").status).toBe("completed");

    const redelivery = await deliver("delivery-2");
    expect(redelivery.status).toBe(200);
    await expect(redelivery.json()).resolves.toMatchObject({ status: "duplicate" });
    expect(syncIntegration).toHaveBeenCalledTimes(1);
  });

  it("a redelivery while the first attempt is still processing is deduped", async () => {
    let finish!: () => void;
    syncIntegration.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ status: "completed" }))));

    await deliver("delivery-3");
    await vi.waitFor(() => expect(syncIntegration).toHaveBeenCalledTimes(1));
    const concurrent = await deliver("delivery-3");
    await expect(concurrent.json()).resolves.toMatchObject({ status: "duplicate" });

    finish();
    await settled("delivery-3");
    expect(syncIntegration).toHaveBeenCalledTimes(1);
  });

  it("a delivery abandoned mid-processing (stale claim) can be reclaimed", async () => {
    store.events.push({
      id: "event-stale",
      provider: "github",
      deliveryId: "delivery-4",
      status: "queued",
      createdAt: new Date(Date.now() - WEBHOOK_CLAIM_STALE_MS - 60_000),
      lastAttemptAt: new Date(Date.now() - WEBHOOK_CLAIM_STALE_MS - 60_000),
      processedAt: null,
      metadata: {},
    });
    syncIntegration.mockResolvedValueOnce({ status: "completed" });

    const response = await deliver("delivery-4");
    await expect(response.json()).resolves.toMatchObject({ status: "accepted", redelivery: true });
    await settled("delivery-4");
    expect(eventRow("delivery-4").status).toBe("completed");
  });

  it("acknowledges ping without running a sync", async () => {
    const response = await deliver("delivery-5", "ping");
    await expect(response.json()).resolves.toMatchObject({ status: "ignored" });
    expect(syncIntegration).not.toHaveBeenCalled();
  });
});
