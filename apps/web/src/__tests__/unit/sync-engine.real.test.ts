/**
 * Real SyncEngine tests (lib/sync/engine.ts) with an in-memory local store and
 * a scripted fetch. Covers queue classification, backoff, the pull cursor,
 * field diffs, sign-out cleanup and the single-write Kanban move.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SyncEngine,
  MemoryLocalStore,
  PULL_OVERLAP_MS,
  classifyPushStatus,
  cursorKey,
  localDbName,
  type KeyValueStorage,
  type PendingMutation,
} from "@/lib/sync/engine";
import { signOutAndClearLocalData, CHAT_STORE_KEY } from "@/lib/sync/sign-out";
import { persistTaskMove } from "@/lib/sync/task-move";

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

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function emptyPull(serverTime = 1_000) {
  return json({ docs: [], tasks: [], workspaces: [], chatMessages: [], agentExecutions: [], lastSync: serverTime, serverTime });
}

let clock = 1_000_000;
let online = true;

function makeEngine(opts: {
  handler: Handler;
  userId?: string;
  store?: MemoryLocalStore;
  storage?: MapStorage;
}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return opts.handler(url, init);
  });
  const store = opts.store ?? new MemoryLocalStore();
  const storage = opts.storage ?? new MapStorage();
  const engine = new SyncEngine({
    userId: opts.userId ?? "user-a",
    localStore: store,
    storage,
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    isOnline: () => online,
  });
  const pushes = () => calls.filter((c) => c.url.includes("/api/sync/push"));
  const pulls = () => calls.filter((c) => c.url.includes("/api/sync/pull"));
  return { engine, store, storage, calls, pushes, pulls, fetchImpl };
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

beforeEach(() => {
  clock = 1_000_000;
  online = true;
});

describe("SyncEngine push queue", () => {
  it("classifies push statuses", () => {
    expect(classifyPushStatus(200)).toBe("ok");
    for (const s of [401, 408, 429, 500, 502, 503]) expect(classifyPushStatus(s)).toBe("transient");
    for (const s of [400, 403, 404, 405, 409, 422]) expect(classifyPushStatus(s)).toBe("permanent");
  });

  it("rejected mutation does not block queue", async () => {
    let pushIndex = 0;
    const { engine, store, pushes, pulls } = makeEngine({
      handler: (url) => {
        if (url.includes("/api/sync/pull")) return emptyPull();
        pushIndex++;
        if (pushIndex === 1) {
          return json(
            {
              error: "Review the submitted pull request before completing this task",
              code: "AGENT_REVIEW_REQUIRED",
              current: task({ status: "in_review", updatedAt: 900 }),
            },
            409
          );
        }
        return json({ success: true });
      },
    });
    await engine.init({ background: false });
    await store.put("tasks", task());
    const rejected = vi.fn();
    engine.onMutationRejected(rejected);

    // Queue three mutations offline, then come back online.
    online = false;
    await engine.mutate("tasks", "update", { ...task(), status: "done" });
    await engine.mutate("tasks", "insert", task({ id: "t2", title: "Second" }));
    await engine.mutate("docs", "insert", { id: "d1", workspaceId: "ws-1", title: "Doc" });
    expect(engine.pendingCount).toBe(3);

    online = true;
    await engine.sync({ force: true });

    // All three were attempted in order; the 409 did not stop the queue.
    expect(pushes()).toHaveLength(3);
    expect(pushes().map((c) => (c.body as PendingMutation).data.id)).toEqual(["t1", "t2", "d1"]);
    expect(engine.pendingCount).toBe(0);
    // ...and the pull still ran.
    expect(pulls()).toHaveLength(1);

    // The rejection is recorded, not dropped, and the user is told.
    const records = await engine.getRejectedMutations();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 409, code: "AGENT_REVIEW_REQUIRED", table: "tasks" });
    expect(rejected).toHaveBeenCalledTimes(1);

    // The optimistic "done" was reverted to the server's copy.
    expect(await engine.get("tasks", "t1")).toMatchObject({ status: "in_review", updatedAt: 900 });
    expect(engine.status).toBe("connected");
  });

  it("removes a rejected insert's optimistic row when the server sends no copy", async () => {
    const { engine } = makeEngine({
      handler: (url) => (url.includes("/pull") ? emptyPull() : json({ error: "Workspace access denied", code: "WORKSPACE_ACCESS_DENIED" }, 403)),
    });
    await engine.init({ background: false });
    online = false;
    await engine.mutate("tasks", "insert", task({ id: "tx" }));
    online = true;
    await engine.sync({ force: true });
    expect(await engine.get("tasks", "tx")).toBeNull();
    expect(await engine.getRejectedMutations()).toHaveLength(1);
  });

  it("429 retries with backoff while pulls continue", async () => {
    let pushStatus = 429;
    const { engine, pushes, pulls } = makeEngine({
      handler: (url) => {
        if (url.includes("/api/sync/pull")) return emptyPull();
        return pushStatus === 429
          ? json({ error: "RATE_LIMIT_EXCEEDED" }, 429, { "Retry-After": "30" })
          : json({ success: true });
      },
    });
    await engine.init({ background: false });
    online = false;
    await engine.mutate("tasks", "insert", task());
    online = true;

    await engine.sync({ force: true });
    expect(pushes()).toHaveLength(1);
    expect(pulls()).toHaveLength(1); // pull ran despite the 429
    expect(engine.pendingCount).toBe(1); // kept, not dropped or rejected
    expect(await engine.getRejectedMutations()).toHaveLength(0);

    // 10 s later: still inside Retry-After. No push, but the pull runs.
    clock += 10_000;
    await engine.sync({ force: true });
    expect(pushes()).toHaveLength(1);
    expect(pulls()).toHaveLength(2);

    // After Retry-After the push is retried and succeeds.
    clock += 21_000;
    pushStatus = 200;
    await engine.sync({ force: true });
    expect(pushes()).toHaveLength(2);
    expect(pulls()).toHaveLength(3);
    expect(engine.pendingCount).toBe(0);
  });

  it("network and 5xx failures keep the mutation and back off exponentially", async () => {
    let attempt = 0;
    const { engine, pushes } = makeEngine({
      handler: (url) => {
        if (url.includes("/pull")) return emptyPull();
        attempt++;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return json({ error: "boom" }, 503);
      },
    });
    await engine.init({ background: false });
    online = false;
    await engine.mutate("tasks", "insert", task());
    online = true;

    await engine.sync({ force: true }); // network error -> 2 s backoff
    clock += 2_001;
    await engine.sync({ force: true }); // 503 -> 4 s backoff
    clock += 2_001;
    await engine.sync({ force: true }); // still backing off
    expect(pushes()).toHaveLength(2);
    expect(engine.pendingCount).toBe(1);
  });

  it("queued edits survive a pull while pushes are backing off", async () => {
    const { engine, store } = makeEngine({
      handler: (url) =>
        url.includes("/pull")
          ? json({ tasks: [task({ title: "Server", updatedAt: 800 })], serverTime: 2_000 })
          : json({}, 503),
    });
    await engine.init({ background: false });
    await store.put("tasks", task());
    online = false;
    await engine.mutate("tasks", "update", { ...task(), status: "done" });
    online = true;
    await engine.sync({ force: true });
    expect(await engine.get("tasks", "t1")).toMatchObject({ title: "Server", status: "done" });
  });
});

describe("SyncEngine pull", () => {
  it("pull cursor uses server time", async () => {
    let serverTime = 1_700_000_000_000;
    const { engine, storage, pulls } = makeEngine({
      handler: (url) => (url.includes("/pull") ? emptyPull(serverTime) : json({})),
    });
    // Browser clock is wildly ahead of the server.
    clock = 1_900_000_000_000;
    await engine.init({ background: false });

    await engine.sync({ force: true });
    expect(pulls()[0].url).toContain("since=0");
    expect(storage.getItem(cursorKey("user-a"))).toBe(String(1_700_000_000_000));

    serverTime = 1_700_000_060_000;
    await engine.sync({ force: true });
    // Next pull starts from the SERVER time minus a small overlap.
    expect(pulls()[1].url).toContain(`since=${1_700_000_000_000 - PULL_OVERLAP_MS}`);
    expect(storage.getItem(cursorKey("user-a"))).toBe(String(1_700_000_060_000));
  });

  it("falls back to lastSync from older servers and maps camelCase tables", async () => {
    const { engine, storage } = makeEngine({
      handler: () =>
        json({ chatMessages: [{ id: "m1", workspaceId: "ws-1", content: "hi", createdAt: 1 }], lastSync: 42_000 }),
    });
    await engine.init({ background: false });
    await engine.sync({ force: true });
    expect(storage.getItem(cursorKey("user-a"))).toBe("42000");
    expect(await engine.get("chat_messages", "m1")).toMatchObject({ content: "hi" });
  });

  it("uses same-origin relative URLs by default", async () => {
    const { engine, calls } = makeEngine({ handler: () => emptyPull() });
    await engine.init({ background: false });
    await engine.sync({ force: true });
    expect(calls[0].url.startsWith("/api/sync/pull")).toBe(true);
  });
});

describe("SyncEngine field diffs", () => {
  it("queues only the changed fields plus their base values", async () => {
    const { engine, store, pushes } = makeEngine({ handler: (url) => (url.includes("/pull") ? emptyPull() : json({})) });
    await engine.init({ background: false });
    await store.put("tasks", task({ description: "keep" }));

    await engine.mutate("tasks", "update", { ...task({ description: "keep" }), status: "in_progress", updatedAt: 123 });

    const sent = pushes()[0].body as PendingMutation;
    expect(sent.data).toEqual({ id: "t1", workspaceId: "ws-1", status: "in_progress" });
    expect(sent.base).toEqual({ updatedAt: 500, fields: { status: "todo" } });
  });

  it("does not queue an update that changes nothing", async () => {
    const { engine, store, pushes } = makeEngine({ handler: () => emptyPull() });
    await engine.init({ background: false });
    await store.put("tasks", task());
    await engine.mutate("tasks", "update", { ...task(), updatedAt: 999 });
    expect(engine.pendingCount).toBe(0);
    expect(pushes()).toHaveLength(0);
  });
});

describe("SyncEngine lifecycle", () => {
  it("destroy before init resolves leaves no timers or listeners behind", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { engine } = makeEngine({ handler: () => emptyPull() });
    const pending = engine.init();
    engine.destroy();
    await pending;
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalledWith("online", expect.anything());
  });

  it("destroy removes the online/offline listeners it added", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { engine } = makeEngine({ handler: () => emptyPull() });
    online = false; // avoid the initial sync timer doing network work
    await engine.init();
    const onlineHandler = add.mock.calls.find((c) => c[0] === "online")?.[1];
    expect(onlineHandler).toBeTypeOf("function");
    engine.destroy();
    expect(remove).toHaveBeenCalledWith("online", onlineHandler);
    expect(remove).toHaveBeenCalledWith("offline", add.mock.calls.find((c) => c[0] === "offline")?.[1]);
  });
});

describe("sign-out", () => {
  it("sign-out clears user data and next user starts clean", async () => {
    const storage = new MapStorage();
    const chatStorage = new MapStorage();
    chatStorage.setItem(CHAT_STORE_KEY, "{\"sessions\":[]}");

    const a = makeEngine({
      userId: "user-a",
      storage,
      handler: (url) => (url.includes("/pull") ? json({ tasks: [task({ title: "A's task" })], serverTime: 5_000 }) : json({}, 503)),
    });
    await a.engine.init({ background: false });
    await a.engine.sync({ force: true });
    online = false;
    await a.engine.mutate("tasks", "insert", task({ id: "unsynced" }));
    online = true;
    expect(storage.getItem(cursorKey("user-a"))).toBe("5000");

    const signOut = vi.fn(async () => {});
    await signOutAndClearLocalData({ engine: a.engine, signOut, storage: chatStorage });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(a.engine.isDestroyed).toBe(true);
    expect(a.store.tables.size).toBe(0); // cache, queue and rejected store gone
    expect(storage.getItem(cursorKey("user-a"))).toBeNull();
    expect(chatStorage.getItem(CHAT_STORE_KEY)).toBeNull();

    // A destroyed engine does no more work.
    const before = a.calls.length;
    await a.engine.sync({ force: true });
    expect(a.calls.length).toBe(before);

    // User B gets their own DB name and cursor key and starts from zero.
    expect(localDbName("user-b")).not.toBe(localDbName("user-a"));
    const b = makeEngine({ userId: "user-b", storage, handler: () => emptyPull(6_000) });
    await b.engine.init({ background: false });
    expect(b.engine.pendingCount).toBe(0);
    expect(await b.engine.query("tasks")).toEqual([]);
    await b.engine.sync({ force: true });
    expect(b.pulls()[0].url).toContain("since=0");
    expect(b.pushes()).toHaveLength(0);
  });

  it("still clears local data when the sign-out request fails", async () => {
    const storage = new MapStorage();
    storage.setItem(cursorKey("user-a"), "123");
    const { engine } = makeEngine({ storage, handler: () => emptyPull() });
    await engine.init({ background: false });
    await expect(
      signOutAndClearLocalData({ engine, signOut: () => Promise.reject(new Error("offline")), storage: new MapStorage() })
    ).rejects.toThrow("offline");
    expect(storage.getItem(cursorKey("user-a"))).toBeNull();
  });
});

describe("Kanban move", () => {
  it("drag issues exactly one write", async () => {
    // Online: one REST PATCH; the cache is updated without queuing a push.
    const online1 = makeEngine({
      handler: (url, init) => {
        if (url.startsWith("/api/tasks/") && init?.method === "PATCH") {
          return json({ id: "t1", status: "done", updatedAt: "2026-01-01T00:00:00.000Z" });
        }
        return emptyPull();
      },
    });
    await online1.engine.init({ background: false });
    await online1.store.put("tasks", task());

    const result = await persistTaskMove({
      engine: online1.engine,
      taskId: "t1",
      status: "done",
      online: true,
      fetchImpl: online1.fetchImpl as unknown as typeof fetch,
    });
    expect(result).toBe("saved");
    const writes = online1.calls.filter((c) => c.method !== "GET");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ url: "/api/tasks/t1", method: "PATCH", body: { status: "done" } });
    expect(online1.engine.pendingCount).toBe(0);
    expect(await online1.engine.get("tasks", "t1")).toMatchObject({
      status: "done",
      updatedAt: Date.parse("2026-01-01T00:00:00.000Z"),
    });

    // Offline: no request now, exactly one queued push later.
    online = false;
    const offline = makeEngine({ handler: (url) => (url.includes("/pull") ? emptyPull() : json({ success: true })) });
    await offline.engine.init({ background: false });
    await offline.store.put("tasks", task());
    const queued = await persistTaskMove({
      engine: offline.engine,
      taskId: "t1",
      status: "in_progress",
      online: false,
      fetchImpl: offline.fetchImpl as unknown as typeof fetch,
    });
    expect(queued).toBe("queued");
    expect(offline.calls).toHaveLength(0);
    expect(offline.engine.pendingCount).toBe(1);

    online = true;
    await offline.engine.sync({ force: true });
    const offlineWrites = offline.calls.filter((c) => c.method !== "GET");
    expect(offlineWrites).toHaveLength(1);
    expect(offlineWrites[0].url).toBe("/api/sync/push");
    expect((offlineWrites[0].body as PendingMutation).data).toEqual({ id: "t1", workspaceId: "ws-1", status: "in_progress" });
  });

  it("a failed PATCH writes nothing locally and throws", async () => {
    const { engine, store, fetchImpl } = makeEngine({ handler: () => json({ error: "x" }, 409) });
    await engine.init({ background: false });
    await store.put("tasks", task());
    await expect(
      persistTaskMove({ engine, taskId: "t1", status: "done", online: true, fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toThrow();
    expect(await engine.get("tasks", "t1")).toMatchObject({ status: "todo" });
    expect(engine.pendingCount).toBe(0);
  });
});
