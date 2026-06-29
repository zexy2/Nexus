import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { integrationConnectStates } from "@nexus/database/schema";
import { db } from "@/lib/db";

export type IntegrationProvider = "github" | "linear";

type ConnectStateRow = typeof integrationConnectStates.$inferSelect;

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function getEncryptionKey() {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY is required for encrypted integration tokens");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATION_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 value");
  }
  return key;
}

export function encryptIntegrationSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptIntegrationSecret<T = unknown>(encrypted: string): T {
  const [version, ivRaw, tagRaw, ciphertextRaw] = encrypted.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error("Unsupported integration token ciphertext format");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export async function createIntegrationConnectState(input: {
  provider: IntegrationProvider;
  workspaceId: string;
  userId: string;
  metadata?: Record<string, unknown>;
  ttlMs?: number;
}) {
  const state = base64Url(randomBytes(32));
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 10 * 60 * 1000));

  await db.insert(integrationConnectStates).values({
    provider: input.provider,
    workspaceId: input.workspaceId,
    userId: input.userId,
    stateHash: sha256Hex(state),
    metadata: input.metadata ?? {},
    expiresAt,
  });

  return state;
}

export async function readIntegrationConnectState(provider: IntegrationProvider, state: string) {
  const row = await db.query.integrationConnectStates.findFirst({
    where: and(
      eq(integrationConnectStates.provider, provider),
      eq(integrationConnectStates.stateHash, sha256Hex(state))
    ),
  });
  if (!row) return null;
  if (row.consumedAt || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function updateIntegrationConnectStateMetadata(
  row: ConnectStateRow,
  metadata: Record<string, unknown>
) {
  await db
    .update(integrationConnectStates)
    .set({ metadata: { ...(row.metadata ?? {}), ...metadata } })
    .where(eq(integrationConnectStates.id, row.id));
}

export async function consumeIntegrationConnectState(provider: IntegrationProvider, state: string) {
  const row = await readIntegrationConnectState(provider, state);
  if (!row) return null;

  await db
    .update(integrationConnectStates)
    .set({ consumedAt: new Date() })
    .where(eq(integrationConnectStates.id, row.id));

  return row;
}

export function getCanonicalAppUrl(requestOrigin?: string) {
  return (process.env.APP_URL || requestOrigin || "http://localhost:3000").replace(/\/+$/, "");
}
