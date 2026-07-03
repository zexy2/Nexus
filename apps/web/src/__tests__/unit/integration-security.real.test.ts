import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  findIntegration: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  syncIntegration: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      workspaceIntegrations: {
        findFirst: (...args: unknown[]) => dbMock.findIntegration(...args),
      },
    },
    insert: (...args: unknown[]) => dbMock.insert(...args),
    update: (...args: unknown[]) => dbMock.update(...args),
  },
}));

vi.mock("@/lib/integrations/sync", () => ({
  syncIntegrationById: (...args: unknown[]) => dbMock.syncIntegration(...args),
}));

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integrations/crypto";
import { POST as postGitHubWebhook } from "@/app/api/webhooks/github/route";
import { POST as postLinearWebhook } from "@/app/api/webhooks/linear/route";

function key(seed: number) {
  return Buffer.alloc(32, seed).toString("base64");
}

function request(url: string, body: string, headers: Record<string, string>) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.LINEAR_WEBHOOK_SECRET;
  delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;

  dbMock.findIntegration.mockResolvedValue({ id: "integration-1", workspaceId: "workspace-1" });
  dbMock.syncIntegration.mockResolvedValue({ status: "completed" });
  dbMock.returning.mockResolvedValue([{ id: "event-1" }]);
  dbMock.onConflictDoNothing.mockReturnValue({ returning: dbMock.returning });
  dbMock.values.mockReturnValue({ onConflictDoNothing: dbMock.onConflictDoNothing });
  dbMock.insert.mockReturnValue({ values: dbMock.values });
  dbMock.where.mockResolvedValue(undefined);
  dbMock.set.mockReturnValue({ where: dbMock.where });
  dbMock.update.mockReturnValue({ set: dbMock.set });
});

afterEach(() => {
  delete process.env.GITHUB_WEBHOOK_SECRET;
  delete process.env.LINEAR_WEBHOOK_SECRET;
  delete process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
});

describe("integration token encryption", () => {
  it("encrypts provider tokens without leaking plaintext", () => {
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = key(7);

    const encrypted = encryptIntegrationSecret({
      accessToken: "linear-access-token",
      refreshToken: "linear-refresh-token",
    });

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("linear-access-token");
    expect(decryptIntegrationSecret(encrypted)).toEqual({
      accessToken: "linear-access-token",
      refreshToken: "linear-refresh-token",
    });
  });

  it("rejects ciphertext when the server encryption key changes", () => {
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = key(3);
    const encrypted = encryptIntegrationSecret({ accessToken: "token" });

    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = key(4);
    expect(() => decryptIntegrationSecret(encrypted)).toThrow();
  });
});

describe("GitHub webhook security", () => {
  it("rejects invalid signatures before recording an event", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "github-secret";
    const response = await postGitHubWebhook(
      request("http://localhost:3000/api/webhooks/github", "{}", {
        "x-hub-signature-256": "sha256=bad",
        "x-github-delivery": "delivery-1",
        "x-github-event": "issues",
      })
    );

    expect(response.status).toBe(401);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("records verified deliveries without storing the raw payload", async () => {
    process.env.GITHUB_WEBHOOK_SECRET = "github-secret";
    const body = JSON.stringify({
      action: "opened",
      installation: { id: 123 },
      repository: { full_name: "zexy2/Nexus" },
    });
    const signature = `sha256=${createHmac("sha256", "github-secret").update(body).digest("hex")}`;

    const response = await postGitHubWebhook(
      request("http://localhost:3000/api/webhooks/github", body, {
        "x-hub-signature-256": signature,
        "x-github-delivery": "delivery-2",
        "x-github-event": "pull_request",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "completed" });
    expect(dbMock.values).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "github",
        deliveryId: "delivery-2",
        eventType: "pull_request",
        status: "queued",
        rawMetadataHash: expect.any(String),
        workspaceId: "workspace-1",
        integrationId: "integration-1",
      })
    );
    expect(JSON.stringify(dbMock.values.mock.calls[0]?.[0])).not.toContain(body);
    expect(dbMock.syncIntegration).toHaveBeenCalledWith("integration-1");
  });
});

describe("Linear webhook security", () => {
  it("rejects stale signed deliveries", async () => {
    process.env.LINEAR_WEBHOOK_SECRET = "linear-secret";
    const body = JSON.stringify({ type: "Issue", action: "update" });
    const timestamp = String(Math.floor((Date.now() - 120_000) / 1000));
    const signature = createHmac("sha256", "linear-secret")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const response = await postLinearWebhook(
      request("http://localhost:3000/api/webhooks/linear", body, {
        "linear-signature": signature,
        "webhook-timestamp": timestamp,
        "linear-delivery": "linear-delivery-1",
      })
    );

    expect(response.status).toBe(401);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("records verified deliveries with timestamped signatures", async () => {
    process.env.LINEAR_WEBHOOK_SECRET = "linear-secret";
    const body = JSON.stringify({
      type: "Issue",
      action: "update",
      organizationId: "org-1",
      data: { id: "issue-1", identifier: "NEX-1", team: { id: "team-1" } },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "linear-secret")
      .update(`${timestamp}.${body}`)
      .digest("hex");

    const response = await postLinearWebhook(
      request("http://localhost:3000/api/webhooks/linear", body, {
        "linear-signature": signature,
        "webhook-timestamp": timestamp,
        "linear-delivery": "linear-delivery-2",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "completed" });
    expect(dbMock.values).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "linear",
        deliveryId: "linear-delivery-2",
        eventType: "Issue",
        status: "queued",
        rawMetadataHash: expect.any(String),
        metadata: expect.objectContaining({
          action: "update",
          organizationId: "org-1",
          objectId: "issue-1",
          identifier: "NEX-1",
          teamId: "team-1",
        }),
      })
    );
    expect(dbMock.syncIntegration).toHaveBeenCalledWith("integration-1");
  });
});
