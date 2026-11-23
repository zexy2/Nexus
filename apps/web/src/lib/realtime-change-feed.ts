import postgres from "postgres";

/**
 * Process-wide Postgres LISTEN for the `nexus_changes` channel.
 *
 * Every open `/api/sync/stream` SSE client used to open its own Postgres
 * connection, so N browser tabs held N connections and could exhaust the
 * server's pool. Instead, one connection per server process LISTENs and fans
 * each notification out in memory to the subscribed streams. The connection
 * is opened by the first subscriber and closed when the last one leaves.
 * postgres.js re-issues LISTEN automatically after a reconnect.
 */

export const CHANGE_CHANNEL = "nexus_changes";

export type ChangeEvent = { workspaceId: string };
export type ChangeHandler = (event: ChangeEvent) => void;

type FeedState = {
  handlers: Set<ChangeHandler>;
  ready: Promise<void> | null;
  client: ReturnType<typeof postgres> | null;
  unlisten: (() => Promise<void>) | null;
};

// Kept on globalThis so dev-mode module reloads reuse the same connection.
const globalForFeed = globalThis as typeof globalThis & {
  __nexusChangeFeed?: FeedState;
};

function feedState(): FeedState {
  globalForFeed.__nexusChangeFeed ??= {
    handlers: new Set(),
    ready: null,
    client: null,
    unlisten: null,
  };
  return globalForFeed.__nexusChangeFeed;
}

function dispatch(state: FeedState, payload: string) {
  let workspaceId: unknown;
  try {
    ({ workspaceId } = JSON.parse(payload));
  } catch {
    return; // ignore malformed payloads
  }
  if (typeof workspaceId !== "string" || !workspaceId) return;
  for (const handler of [...state.handlers]) {
    try {
      handler({ workspaceId });
    } catch (error) {
      console.error("[change-feed] subscriber failed:", error);
    }
  }
}

async function connect(state: FeedState, databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const subscription = await client.listen(CHANGE_CHANNEL, (payload) => dispatch(state, payload));
    state.client = client;
    state.unlisten = subscription.unlisten;
  } catch (error) {
    await client.end({ timeout: 1 }).catch(() => {});
    throw error;
  }
}

async function teardownIfIdle(state: FeedState) {
  const ready = state.ready;
  if (!ready) return;
  await ready.catch(() => {});
  // Someone subscribed again (or a new connection replaced this one) while
  // we waited: keep the connection.
  if (state.handlers.size > 0 || state.ready !== ready) return;

  const { client, unlisten } = state;
  state.ready = null;
  state.client = null;
  state.unlisten = null;
  if (unlisten) await unlisten().catch(() => {});
  if (client) await client.end({ timeout: 1 }).catch(() => {});
}

/**
 * Subscribe to workspace change notifications. Resolves once the shared
 * LISTEN is active (rejects if it cannot be established). The returned
 * function unsubscribes; it is idempotent.
 */
export async function subscribeToChanges(
  databaseUrl: string,
  handler: ChangeHandler
): Promise<() => Promise<void>> {
  const state = feedState();
  state.handlers.add(handler);

  if (!state.ready) {
    const ready = connect(state, databaseUrl).catch((error) => {
      if (state.ready === ready) state.ready = null;
      throw error;
    });
    state.ready = ready;
  }

  try {
    await state.ready;
  } catch (error) {
    state.handlers.delete(handler);
    throw error;
  }

  let active = true;
  return async () => {
    if (!active) return;
    active = false;
    state.handlers.delete(handler);
    if (state.handlers.size === 0) await teardownIfIdle(state);
  };
}

/** Number of in-process subscribers (diagnostics/tests). */
export function changeFeedSubscriberCount() {
  return feedState().handlers.size;
}
