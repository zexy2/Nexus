/**
 * Keeps the short-lived collaboration token on a y-websocket provider fresh.
 *
 * y-websocket rebuilds its URL from `provider.params` on every reconnect, so
 * updating `params.token` is enough for the next connection attempt to use a
 * new token. We refresh proactively shortly before expiry, and reactively when
 * the socket closes with an expired/expiring token (laptop sleep, network
 * drop): auto-reconnect is paused until the new token has been fetched, so the
 * provider never spins on 401s.
 */

export class CollabTokenError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "CollabTokenError";
  }

  /** The server refused to issue a token (no session / no access). */
  get isFatal() {
    return this.status === 401 || this.status === 403 || this.status === 404;
  }
}

/** The subset of WebsocketProvider this helper relies on. */
export interface RefreshableProvider {
  params: Record<string, string>;
  shouldConnect: boolean;
  wsconnected: boolean;
  connect(): void;
  on(event: "connection-close", listener: (...args: unknown[]) => void): void;
  off(event: "connection-close", listener: (...args: unknown[]) => void): void;
}

export interface CollabTokenRefreshOptions {
  fetchToken: () => Promise<string>;
  /** Refresh this long before expiry. */
  refreshMarginMs?: number;
  /** Backoff between failed token fetches. */
  retryDelaysMs?: number[];
  now?: () => number;
  /** Called when the server permanently refuses a token. */
  onFatalError?: (error: CollabTokenError) => void;
  /** Called after each fetch attempt (true = token obtained). */
  onTokenStatus?: (ok: boolean) => void;
}

/** Read the expiry (epoch ms) from a collab token without verifying it. */
export function readCollabTokenExpiry(token: string | undefined | null): number | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  try {
    const base64 = token.slice(0, dot).replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { e?: unknown };
    return typeof payload.e === "number" ? payload.e : null;
  } catch {
    return null;
  }
}

export async function fetchCollabToken(docId: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api/collab/token?docId=${encodeURIComponent(docId)}`, {
      cache: "no-store",
    });
  } catch (error) {
    throw new CollabTokenError(
      error instanceof Error ? error.message : "Token request failed",
      null
    );
  }
  if (!res.ok) {
    throw new CollabTokenError(`Token request rejected: ${res.status}`, res.status);
  }
  const token = (await res.json().catch(() => null))?.token;
  if (typeof token !== "string" || !token) {
    throw new CollabTokenError("Token response missing token", res.status);
  }
  return token;
}

export function attachCollabTokenRefresh(
  provider: RefreshableProvider,
  {
    fetchToken,
    refreshMarginMs = 5 * 60 * 1000,
    retryDelaysMs = [1000, 3000, 10_000, 30_000],
    now = Date.now,
    onFatalError,
    onTokenStatus,
  }: CollabTokenRefreshOptions
) {
  let disposed = false;
  let fatal = false;
  let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
  let inflight: Promise<boolean> | null = null;
  let consecutiveFailedConnects = 0;
  let lastRefreshAt = 0;
  /** Reconnect is paused by us and must be resumed after a refresh. */
  let paused = false;

  const tokenExpiry = () => readCollabTokenExpiry(provider.params.token);
  const tokenUsable = (margin = 5000) => {
    const expiry = tokenExpiry();
    return expiry !== null && expiry - now() > margin;
  };
  const expiringSoon = () => !tokenUsable(refreshMarginMs);

  function clearTimers() {
    if (proactiveTimer) clearTimeout(proactiveTimer);
    if (retryTimer) clearTimeout(retryTimer);
    proactiveTimer = null;
    retryTimer = null;
  }

  function scheduleProactive() {
    if (proactiveTimer) clearTimeout(proactiveTimer);
    proactiveTimer = null;
    const expiry = tokenExpiry();
    if (disposed || fatal || expiry === null) return;
    const delay = Math.max(1000, expiry - refreshMarginMs - now());
    proactiveTimer = setTimeout(() => {
      proactiveTimer = null;
      void refresh();
    }, delay);
  }

  function scheduleRetry() {
    if (disposed || fatal || retryTimer) return;
    const delay = retryDelaysMs[Math.min(retryAttempt, retryDelaysMs.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void refresh();
    }, delay);
  }

  function resume() {
    if (!paused || disposed || fatal) return;
    paused = false;
    provider.connect();
  }

  function refresh(): Promise<boolean> {
    if (disposed || fatal) return Promise.resolve(false);
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const token = await fetchToken();
        if (disposed) return false;
        provider.params = { ...provider.params, token };
        lastRefreshAt = now();
        retryAttempt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        onTokenStatus?.(true);
        scheduleProactive();
        resume();
        return true;
      } catch (error) {
        if (disposed) return false;
        onTokenStatus?.(false);
        if (error instanceof CollabTokenError && error.isFatal) {
          fatal = true;
          clearTimers();
          onFatalError?.(error);
          return false;
        }
        // A still-valid token can keep being used while we retry.
        if (paused && tokenUsable()) resume();
        scheduleRetry();
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  const handleClose = () => {
    if (disposed || fatal) return;
    // `provider.disconnect()` clears shouldConnect before emitting; respect
    // intentional disconnects.
    if (!provider.shouldConnect) return;

    const wasConnected = provider.wsconnected;
    consecutiveFailedConnects = wasConnected ? 0 : consecutiveFailedConnects + 1;

    const repeatedFailures =
      consecutiveFailedConnects >= 2 && now() - lastRefreshAt > 30_000;
    if (expiringSoon() || repeatedFailures) {
      // Stop y-websocket's scheduled reconnect (it checks shouldConnect) until
      // a fresh token is in place.
      provider.shouldConnect = false;
      paused = true;
      void refresh();
    }
  };

  const handleOnline = () => {
    if (paused || expiringSoon()) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      void refresh();
    }
  };

  provider.on("connection-close", handleClose);
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }

  return {
    /** Obtain a token if needed and connect. */
    start(): Promise<boolean> {
      if (tokenUsable(refreshMarginMs)) {
        scheduleProactive();
        provider.connect();
        return Promise.resolve(true);
      }
      provider.shouldConnect = false;
      paused = true;
      return refresh();
    },
    refresh,
    dispose() {
      disposed = true;
      clearTimers();
      provider.off("connection-close", handleClose);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    },
  };
}
