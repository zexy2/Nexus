/**
 * Collaboration access tokens.
 *
 * The realtime collaboration server is a separate process that can't run the
 * full auth/authorization stack. Instead, Next.js (which can) issues a short-
 * lived, document-scoped HMAC token after verifying the session AND that the
 * user may access the document. The collab server only has to verify the token
 * signature, expiry and that it matches the requested room — it trusts that
 * Next.js already authorized access.
 *
 * Dependency-free (Node crypto only) so it imports cleanly into both the Next.js
 * route and the tsx-run collaboration server.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface CollabTokenPayload {
  /** Document id the token grants access to. */
  d: string;
  /** User id the token was issued to (for audit/awareness). */
  u: string;
  /** Expiry, epoch milliseconds. */
  e: number;
}

// Tokens travel in the WebSocket URL, so keep their exposure window short.
// The editor can transparently request a fresh token when reconnecting.
export const COLLAB_TOKEN_TTL_MS = 30 * 60 * 1000;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signCollabToken(
  payload: Omit<CollabTokenPayload, "e"> & { e?: number },
  secret: string
): string {
  const full: CollabTokenPayload = {
    d: payload.d,
    u: payload.u,
    e: payload.e ?? Date.now() + COLLAB_TOKEN_TTL_MS,
  };
  const body = base64url(JSON.stringify(full));
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verify a token's signature and expiry. Returns the payload when valid,
 * otherwise null. Does NOT check the document — the caller compares
 * `payload.d` against the requested room.
 */
export function verifyCollabToken(token: string, secret: string): CollabTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(body, secret);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: CollabTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload || typeof payload.d !== "string" || typeof payload.e !== "number") return null;
  if (Date.now() > payload.e) return null;

  return payload;
}
