/**
 * Real unit tests for the collaboration token helper (lib/collab-token).
 *
 * These guard the security boundary of the realtime collaboration server: a
 * token must only verify with the right secret, an intact signature, before
 * expiry, and the caller must be able to bind it to a specific document.
 */
import { describe, it, expect } from "vitest";
import { signCollabToken, verifyCollabToken, COLLAB_TOKEN_TTL_MS } from "@/lib/collab-token";

const SECRET = "test-collab-secret";

describe("collab-token (real)", () => {
  it("round-trips a valid token", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1" }, SECRET);
    const payload = verifyCollabToken(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.d).toBe("doc-1");
    expect(payload!.u).toBe("user-1");
    expect(payload!.e).toBeGreaterThan(Date.now());
    expect(payload!.e).toBeLessThanOrEqual(Date.now() + COLLAB_TOKEN_TTL_MS + 1000);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1" }, SECRET);
    expect(verifyCollabToken(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1" }, SECRET);
    const [body, sig] = token.split(".");
    // Flip the document id in the payload while keeping the old signature.
    const forged = Buffer.from(JSON.stringify({ d: "victim-doc", u: "user-1", e: Date.now() + 1e6 }))
      .toString("base64url");
    expect(verifyCollabToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(body).toBeTruthy();
  });

  it("rejects a tampered signature", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1" }, SECRET);
    const [body] = token.split(".");
    expect(verifyCollabToken(`${body}.deadbeef`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1", e: Date.now() - 1000 }, SECRET);
    expect(verifyCollabToken(token, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyCollabToken("", SECRET)).toBeNull();
    expect(verifyCollabToken("no-dot", SECRET)).toBeNull();
    expect(verifyCollabToken(".onlysig", SECRET)).toBeNull();
  });

  it("lets the caller bind the token to a document (room check)", () => {
    const token = signCollabToken({ d: "doc-1", u: "user-1" }, SECRET);
    const payload = verifyCollabToken(token, SECRET);
    // The collab server accepts only when payload.d === requested room.
    expect(payload!.d === "doc-1").toBe(true);
    expect(payload!.d === "doc-2").toBe(false);
  });
});
