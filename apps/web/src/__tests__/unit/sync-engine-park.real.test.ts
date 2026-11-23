/**
 * Real SyncEngine tests for the "never block the queue, never lose data"
 * guarantees: a mutation the server keeps failing with 5xx is parked (kept,
 * retryable) so later mutations proceed; rejected mutations can be re-queued;
 * sign-out warns about rejected mutations and queued offline commands.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SyncEngine,
  MemoryLocalStore,
  SERVER_ERROR_MAX_STRIKES,
  SERVER_ERROR_MIN_STRIKES,
  SERVER_ERROR_PARK_AFTER_MS,
  type KeyValueStorage,
  type PendingMutation,
} from "@/lib/sync/engine";
import { signOutAndClearLocalData } from "@/lib/sync/sign-out";

class MapStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

type Handler = (url: string, body: PendingMutation | undefined) => Response | Promise<Response>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function emptyPull(serverTime = 1_000) {
  return json({ docs: [], tasks: [], workspaces: [], chatMessages: [], agentExecutions: [], serverTime });
}

let clock = 1_000_000;
let online = true;

function makeEngine(handler: Handler, store = new MemoryLocalStore()) {
  const calls: Array<{ url: string; body: PendingMutation | undefined }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as PendingMutation) : undefined;
    calls.push({ url, body });
    return handler(url, body);
  });
  const engine = new SyncEngine({
    userId: "user-a",
    localStore: store,
    storage: new MapStorage(),
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    isOnline: () => online,
  });
  const pushes = () => calls.filter((c) => c.url.includes("/api/sync/push"));
  return { engine, store, pushes };
}

const task = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  workspaceId: "ws-1",
  title: "Original",
  status: "todo",
  priority: "medium",
  createdAt: 1,
  updatedAt: 500,
  ...over,
});

/** Let the follow-up sync the engine schedules after parking finish. */
async function settle(engine: SyncEngine) {
  await vi.waitFor(() => expect(engine.status).not.toBe("syncing"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vi.waitFor(() => expect(engine.status).not.toBe("syncing"));
}

beforeEach(() => {
  clock = 1_000_000;
  online = true;
});

describe("persistent server errors", () => {
  it("persistent 5xx mutation is parked and queue proceeds", async () => {
    const { engine, store, pushes } = makeEngine((url, body) => {
      if (url.includes("/pull")) return emptyPull();
      // The server can never store t-bad (e.g. it hits a database bug).
      if (body?.data.id === "t-bad") return json({ error: "Failed to apply mutation", code: "SYNC_PUSH_FAILED" }, 500);
      return json({ success: true });
    });
    await engine.init({ background: false });
    const rejected = vi.fn();
    engine.onMutationRejected(rejected);

    online = false;
    await engine.mutate("tasks", "insert", task({ id: "t-bad", title: "Bad" }));
    await engine.mutate("tasks", "insert", task({ id: "t-good", title: "Good" }));
    online = true;

    // Each cycle: the head mutation gets a 500 while the pull works -> strike.
    for (let i = 1; i < SERVER_ERROR_MAX_STRIKES; i++) {
      await engine.sync({ force: true });
      expect(engine.pendingCount).toBe(2); // order preserved, nothing skipped yet
      expect(pushes().every((c) => c.body?.data.id === "t-bad")).toBe(true);
      clock += 2_000 * 2 ** (i - 1) + 1; // just past the exponential push backoff
    }
    // Strikes are persisted with the queued mutation (survive a reload) but
    // are never sent to the server.
    const queued = await store.get<PendingMutation>("pending_mutations", pushes()[0].body!.id);
    expect(queued?.serverErrors?.count).toBe(SERVER_ERROR_MAX_STRIKES - 1);
    expect(pushes()[pushes().length - 1].body).not.toHaveProperty("serverErrors");

    await engine.sync({ force: true });
    await settle(engine);

    // Parked: kept in the rejected store as a retryable server error...
    const records = await engine.getRejectedMutations();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ reason: "server_error", status: 500, code: "SYNC_PUSH_FAILED" });
    expect(records[0].data.id).toBe("t-bad");
    expect(records[0]).not.toHaveProperty("serverErrors");
    expect(engine.rejectedCount).toBe(1);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: "server_error" }));
    // ...and the mutation behind it went through.
    expect(pushes().some((c) => c.body?.data.id === "t-good")).toBe(true);
    expect(engine.pendingCount).toBe(0);
  });

  it("parks after the time limit with fewer strikes, but never during an outage", async () => {
    let pullDown = true;
    const { engine, pushes } = makeEngine((url) => {
      if (url.includes("/pull")) return pullDown ? json({}, 503) : emptyPull();
      return json({}, 503);
    });
    await engine.init({ background: false });
    online = false;
    await engine.mutate("tasks", "insert", task({ id: "t-x" }));
    online = true;

    // Whole server down (pull fails too): no strikes, however long it lasts.
    for (let i = 0; i < SERVER_ERROR_MAX_STRIKES * 2; i++) {
      await engine.sync({ force: true });
      clock += SERVER_ERROR_PARK_AFTER_MS;
    }
    expect(pushes().length).toBeGreaterThan(SERVER_ERROR_MAX_STRIKES);
    expect(engine.pendingCount).toBe(1);
    expect(await engine.getRejectedMutations()).toHaveLength(0);

    // Server back but this mutation keeps failing: MIN strikes spread over
    // PARK_AFTER_MS are enough.
    pullDown = false;
    for (let i = 0; i < SERVER_ERROR_MIN_STRIKES; i++) {
      await engine.sync({ force: true });
      clock += SERVER_ERROR_PARK_AFTER_MS / 2;
    }
    await settle(engine);
    expect(engine.pendingCount).toBe(0);
    expect(await engine.getRejectedMutations()).toEqual([expect.objectContaining({ reason: "server_error", status: 503 })]);
  });
});

describe("rejected mutation actions", () => {
  it("retry re-queues rejected mutation", async () => {
    let serverHealthy = false;
    const { engine, pushes } = makeEngine((url) => {
      if (url.includes("/pull")) return emptyPull();
      return serverHealthy ? json({ success: true }) : json({ error: "Workspace access denied", code: "WORKSPACE_ACCESS_DENIED" }, 403);
    });
    await engine.init({ background: false });
    const counts: number[] = [];
    engine.onRejectedCountChange((count) => counts.push(count));

    online = false;
    await engine.mutate("tasks", "insert", task({ id: "t-retry", title: "Mine" }));
    online = true;
    await engine.sync({ force: true });

    // Rejected: recorded, optimistic row removed, queue empty.
    const [record] = await engine.getRejectedMutations();
    expect(record).toMatchObject({ status: 403, reason: "rejected" });
    expect(await engine.get("tasks", "t-retry")).toBeNull();
    expect(engine.pendingCount).toBe(0);
    expect(engine.rejectedCount).toBe(1);

    // Access was granted meanwhile; the user clicks Retry.
    serverHealthy = true;
    clock += 1_000;
    expect(await engine.retryRejectedMutation(record.id)).toBe(true);

    // Re-queued (same mutation id, same payload), pushed and accepted.
    const last = pushes()[pushes().length - 1].body!;
    expect(last).toMatchObject({ id: record.id, table: "tasks", operation: "insert" });
    expect(last.data).toMatchObject({ id: "t-retry", title: "Mine" });
    expect(engine.pendingCount).toBe(0);
    expect(await engine.getRejectedMutations()).toHaveLength(0);
    expect(engine.rejectedCount).toBe(0);
    expect(counts).toEqual([1, 0]);
    // The optimistic row is back.
    expect(await engine.get("tasks", "t-retry")).toMatchObject({ title: "Mine" });

    // Unknown ids are a no-op.
    expect(await engine.retryRejectedMutation("missing")).toBe(false);
  });

  it("retrying a STALE_BASE conflict rebases onto the current row; dismiss discards", async () => {
    let conflict = true;
    const { engine, store, pushes } = makeEngine((url) => {
      if (url.includes("/pull")) return emptyPull();
      return conflict
        ? json({ error: "changed", code: "STALE_BASE", current: task({ title: "Theirs", updatedAt: 900 }) }, 409)
        : json({ success: true });
    });
    await engine.init({ background: false });
    await store.put("tasks", task());
    await engine.mutate("tasks", "update", { ...task(), title: "Mine" });
    expect(await engine.get("tasks", "t1")).toMatchObject({ title: "Theirs" });

    const [record] = await engine.getRejectedMutations();
    conflict = false;
    await engine.retryRejectedMutation(record.id);
    const last = pushes()[pushes().length - 1].body!;
    expect(last.data).toMatchObject({ title: "Mine" });
    expect(last.base).toMatchObject({ updatedAt: 900, fields: { title: "Theirs" } });

    // Discard removes the record for good.
    conflict = true;
    await engine.mutate("tasks", "update", { ...(await engine.get<Record<string, unknown>>("tasks", "t1"))!, title: "Again" } as never);
    const [second] = await engine.getRejectedMutations();
    await engine.dismissRejectedMutation(second.id);
    expect(await engine.getRejectedMutations()).toHaveLength(0);
    expect(engine.rejectedCount).toBe(0);
  });
});

describe("sign-out", () => {
  it("sign-out warns about rejected mutations and queued commands", async () => {
    const { engine, store } = makeEngine((url) =>
      url.includes("/pull") ? emptyPull() : json({ error: "denied", code: "WORKSPACE_ACCESS_DENIED" }, 403)
    );
    await engine.init({ background: false });
    await engine.mutate("tasks", "insert", task({ id: "t-rej" }));
    expect(engine.pendingCount).toBe(0); // nothing "unsynced" in the queue...
    expect(engine.rejectedCount).toBe(1); // ...but one rejected change is kept

    const signOut = vi.fn(async () => {});
    const confirmDiscard = vi.fn(async () => false);
    const result = await signOutAndClearLocalData({
      engine,
      signOut,
      storage: new MapStorage(),
      countUnsyncedDocuments: () => 0,
      countQueuedCommands: async () => 2,
      confirmDiscard,
    });

    expect(result).toBe("cancelled");
    expect(confirmDiscard).toHaveBeenCalledWith({
      mutations: 0,
      documents: 0,
      rejected: 1,
      commands: 2,
      unsynced: 2,
      total: 3,
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(await store.get("rejected_mutations", (await engine.getRejectedMutations())[0].id)).not.toBeNull();

    // Only rejected mutations (no queued commands) still ask.
    const onlyRejected = vi.fn(async () => true);
    expect(
      await signOutAndClearLocalData({
        engine,
        signOut,
        storage: new MapStorage(),
        countQueuedCommands: async () => 0,
        confirmDiscard: onlyRejected,
      })
    ).toBe("signed-out");
    expect(onlyRejected).toHaveBeenCalledWith(expect.objectContaining({ rejected: 1, unsynced: 0, total: 1 }));
    expect(store.tables.size).toBe(0);
  });
});
