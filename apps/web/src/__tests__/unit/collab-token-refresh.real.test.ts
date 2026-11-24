import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signCollabToken } from "@/lib/collab-token";
import {
  CollabTokenError,
  attachCollabTokenRefresh,
  readCollabTokenExpiry,
  type RefreshableProvider,
} from "@/lib/collab/token-refresh";

const SECRET = "secret";

function fakeProvider(token?: string) {
  const listeners = new Set<(...args: unknown[]) => void>();
  const provider: RefreshableProvider & { emitClose(): void; connects: number } = {
    params: token ? { token } : {},
    shouldConnect: false,
    wsconnected: false,
    connects: 0,
    connect() {
      this.shouldConnect = true;
      this.connects += 1;
    },
    on: (_event, listener) => listeners.add(listener),
    off: (_event, listener) => listeners.delete(listener),
    emitClose() {
      listeners.forEach((listener) => listener(null, provider));
    },
  };
  return provider;
}

describe("collab token refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collab token refreshes before expiry", async () => {
    const fetchToken = vi.fn(async () => signCollabToken({ d: "doc", u: "u" }, SECRET));
    const provider = fakeProvider();
    const refresh = attachCollabTokenRefresh(provider, {
      fetchToken,
      refreshMarginMs: 5 * 60 * 1000,
    });

    await refresh.start();
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(provider.connects).toBe(1);
    const first = provider.params.token;
    const firstExpiry = readCollabTokenExpiry(first)!;
    expect(firstExpiry).toBe(Date.now() + 30 * 60 * 1000);

    // Nothing happens until 5 minutes before expiry...
    await vi.advanceTimersByTimeAsync(24 * 60 * 1000);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    // ...then the token is replaced without dropping the connection.
    await vi.advanceTimersByTimeAsync(60 * 1000 + 10);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(provider.params.token).not.toBe(first);
    expect(readCollabTokenExpiry(provider.params.token)!).toBeGreaterThan(firstExpiry);
    expect(provider.shouldConnect).toBe(true);
    expect(provider.connects).toBe(1);

    // And keeps doing so for long sessions.
    await vi.advanceTimersByTimeAsync(25 * 60 * 1000 + 10);
    expect(fetchToken).toHaveBeenCalledTimes(3);
    refresh.dispose();
  });

  it("pauses reconnect on close with an expired token until a new one arrives", async () => {
    const expired = signCollabToken({ d: "doc", u: "u", e: Date.now() - 1 }, SECRET);
    let resolveToken!: (token: string) => void;
    const fetchToken = vi.fn(
      () => new Promise<string>((resolve) => (resolveToken = resolve))
    );
    const provider = fakeProvider(expired);
    provider.shouldConnect = true;
    const refresh = attachCollabTokenRefresh(provider, { fetchToken });

    provider.emitClose();
    expect(provider.shouldConnect).toBe(false);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    resolveToken(signCollabToken({ d: "doc", u: "u" }, SECRET));
    await vi.advanceTimersByTimeAsync(0);
    expect(provider.shouldConnect).toBe(true);
    expect(provider.connects).toBe(1);
    expect(provider.params.token).not.toBe(expired);
    refresh.dispose();
  });

  it("retries transient token failures and stops on access denial", async () => {
    const onFatalError = vi.fn();
    const fetchToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new CollabTokenError("offline", null))
      .mockRejectedValueOnce(new CollabTokenError("forbidden", 403));
    const provider = fakeProvider();
    const refresh = attachCollabTokenRefresh(provider, {
      fetchToken,
      retryDelaysMs: [1000],
      onFatalError,
    });

    await refresh.start();
    expect(provider.connects).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(onFatalError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(provider.connects).toBe(0);
    refresh.dispose();
  });

  it("ignores intentional disconnects", () => {
    const expired = signCollabToken({ d: "doc", u: "u", e: Date.now() - 1 }, SECRET);
    const fetchToken = vi.fn(async () => "x");
    const provider = fakeProvider(expired);
    provider.shouldConnect = false;
    const refresh = attachCollabTokenRefresh(provider, { fetchToken });
    provider.emitClose();
    expect(fetchToken).not.toHaveBeenCalled();
    refresh.dispose();
  });
});
