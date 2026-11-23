/**
 * Local-first sync engine (framework-free; the React bindings live in zero.tsx).
 *
 * - Reads come from a per-user IndexedDB cache and work with no network.
 * - Mutations update the cache immediately and are queued in the same DB.
 * - When online, the queue is pushed to /api/sync/push one mutation at a time,
 *   in order, and changes are pulled from /api/sync/pull.
 *
 * Push outcome classification (see classifyPushStatus):
 * - 2xx: done, removed from the queue.
 * - 401/408/425/429/5xx and network errors: transient. The queue stops at that
 *   mutation (order is preserved) and pushing waits for an exponential backoff
 *   that honours Retry-After. Pulls keep running in the meantime.
 * - Any other 4xx (400/403/404/405/409/422...): permanent. The mutation is moved
 *   to the persisted `rejected_mutations` store, the local row is replaced by
 *   the server copy (or removed / fully re-pulled when no copy is available),
 *   rejection listeners are told (the provider shows a toast), and the queue
 *   continues with the next mutation. Nothing is dropped without a record.
 *
 * Updates send only the fields that changed versus the cached row, plus
 * `base` (the cached values of those fields and the cached updatedAt). The
 * server applies them per field and answers 409 STALE_BASE when someone else
 * changed one of the same fields in between (see app/api/sync/push/route.ts).
 *
 * The pull cursor is the server's own timestamp (`serverTime`, or `lastSync`
 * from older servers), never the browser clock, re-read with a small overlap.
 *
 * Everything is namespaced by user id: the IndexedDB name and the cursor key.
 * clearLocalData() deletes both on sign-out.
 */

export type SyncStatus = "connecting" | "connected" | "disconnected" | "syncing" | "error";

type Row = Record<string, unknown>;

export interface MutationBase {
  /** updatedAt of the cached row the edit was made against. */
  updatedAt?: number;
  /** Cached value of every field sent in `data` (null when absent). */
  fields: Row;
}

export interface PendingMutation {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  data: Row;
  timestamp: number;
  base?: MutationBase;
}

export interface RejectedMutation extends PendingMutation {
  status: number;
  code?: string;
  error?: string;
  rejectedAt: number;
}

export interface LocalStoreLike {
  init(): Promise<void>;
  getAll<T>(table: string): Promise<T[]>;
  getByWorkspace<T>(table: string, workspaceId: string): Promise<T[]>;
  get<T>(table: string, id: string): Promise<T | null>;
  put<T extends { id: string }>(table: string, data: T): Promise<void>;
  delete(table: string, id: string): Promise<void>;
  close(): void;
  /** Close and permanently delete all locally stored data. */
  destroy(): Promise<void>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DATA_TABLES = ["docs", "tasks", "workspaces", "users", "agent_executions", "chat_messages"] as const;
const QUEUE_TABLES = ["pending_mutations", "rejected_mutations"] as const;

/** The pull route uses camelCase keys for two tables; the cache uses snake_case. */
const PULL_TABLE_MAP: Record<string, string> = {
  chatMessages: "chat_messages",
  agentExecutions: "agent_executions",
};

/** Re-read this much before the stored cursor to absorb app-server clock skew. */
export const PULL_OVERLAP_MS = 5_000;
const INITIAL_PUSH_BACKOFF_MS = 2_000;
const MAX_PUSH_BACKOFF_MS = 5 * 60_000;
const INITIAL_SYNC_BACKOFF_MS = 5_000;
const MAX_SYNC_BACKOFF_MS = 60_000;
const POLL_INTERVAL_MS = 10_000;
const LEGACY_DB_NAME = "nexus-local";
const LEGACY_CURSOR_KEY = "nexus-last-sync";

/** Fields that are bookkeeping, not user edits, and never form part of a diff. */
const NON_DIFF_FIELDS = new Set(["id", "workspaceId", "createdAt", "updatedAt"]);

export function localDbName(userId: string) {
  return `${LEGACY_DB_NAME}:${userId}`;
}

export function cursorKey(userId: string) {
  return `${LEGACY_CURSOR_KEY}:${userId}`;
}

export type PushOutcome = "ok" | "transient" | "permanent";

export function classifyPushStatus(status: number): PushOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 408 || status === 425 || status === 429) return "transient";
  if (status >= 400 && status < 500) return "permanent";
  return "transient";
}

/** Retry-After in ms (delta-seconds or HTTP date), or null. */
export function parseRetryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function isEqualValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bArr = b as unknown[];
    return a.length === bArr.length && a.every((item, i) => isEqualValue(item, bArr[i]));
  }
  const aRow = a as Row;
  const bRow = b as Row;
  const keys = new Set([...Object.keys(aRow), ...Object.keys(bRow)]);
  for (const key of keys) if (!isEqualValue(aRow[key], bRow[key])) return false;
  return true;
}

/** Fields of `next` whose value differs from `base` (bookkeeping fields ignored). */
export function diffFields(base: Row, next: Row): Row {
  const changes: Row = {};
  for (const [key, value] of Object.entries(next)) {
    if (NON_DIFF_FIELDS.has(key)) continue;
    if (!isEqualValue(base[key], value)) changes[key] = value;
  }
  return changes;
}

// ==========================================
// LOCAL STORES
// ==========================================

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbLocalStore implements LocalStoreLike {
  private db: IDBDatabase | null = null;

  constructor(private readonly dbName: string, private readonly dbVersion = 1) {}

  async init(): Promise<void> {
    if (typeof indexedDB === "undefined" || this.db) return;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onerror = () => reject(request.error);
      // Another tab holds an older version open; it closes itself on
      // versionchange (below), so just wait for success.
      request.onblocked = () => console.warn("[Sync] Local database upgrade blocked by another tab");
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        // Additive only: never drop a store (pending_mutations must survive
        // every upgrade).
        const db = request.result;
        for (const store of DATA_TABLES) {
          if (!db.objectStoreNames.contains(store)) {
            const objectStore = db.createObjectStore(store, { keyPath: "id" });
            objectStore.createIndex("workspaceId", "workspaceId", { unique: false });
            objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        }
        for (const store of QUEUE_TABLES) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: "id" });
        }
      };
    });

    // Let other tabs upgrade or delete this DB (sign-out) instead of blocking.
    this.db.onversionchange = () => this.close();
  }

  private store(table: string, mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db || !this.db.objectStoreNames.contains(table)) return null;
    return this.db.transaction(table, mode).objectStore(table);
  }

  async getAll<T>(table: string): Promise<T[]> {
    const store = this.store(table, "readonly");
    return store ? ((await promisify(store.getAll())) as T[]) : [];
  }

  async getByWorkspace<T>(table: string, workspaceId: string): Promise<T[]> {
    const store = this.store(table, "readonly");
    if (!store || !store.indexNames.contains("workspaceId")) return [];
    return (await promisify(store.index("workspaceId").getAll(workspaceId))) as T[];
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    const store = this.store(table, "readonly");
    if (!store) return null;
    return ((await promisify(store.get(id))) as T | undefined) ?? null;
  }

  async put<T extends { id: string }>(table: string, data: T): Promise<void> {
    const store = this.store(table, "readwrite");
    if (store) await promisify(store.put(data));
  }

  async delete(table: string, id: string): Promise<void> {
    const store = this.store(table, "readwrite");
    if (store) await promisify(store.delete(id));
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  async destroy(): Promise<void> {
    this.close();
    await deleteDatabase(this.dbName);
  }
}

export function deleteDatabase(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    // Blocked: another tab still has it open. The delete completes once that
    // tab closes it (our stores close on versionchange); don't hang sign-out.
    request.onblocked = () => resolve();
  });
}

/** Non-persistent store: used without IndexedDB/user id, and in tests. */
export class MemoryLocalStore implements LocalStoreLike {
  tables = new Map<string, Map<string, Row>>();

  async init(): Promise<void> {}

  private table(name: string) {
    let table = this.tables.get(name);
    if (!table) {
      table = new Map();
      this.tables.set(name, table);
    }
    return table;
  }

  async getAll<T>(table: string): Promise<T[]> {
    return [...this.table(table).values()].map((row) => structuredClone(row)) as T[];
  }

  async getByWorkspace<T>(table: string, workspaceId: string): Promise<T[]> {
    return (await this.getAll<Row>(table)).filter((row) => row.workspaceId === workspaceId) as T[];
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    const row = this.table(table).get(id);
    return row ? (structuredClone(row) as T) : null;
  }

  async put<T extends { id: string }>(table: string, data: T): Promise<void> {
    this.table(table).set(data.id, structuredClone(data) as Row);
  }

  async delete(table: string, id: string): Promise<void> {
    this.table(table).delete(id);
  }

  close(): void {}

  async destroy(): Promise<void> {
    this.tables.clear();
  }
}

/**
 * Move mutations queued by the pre-namespacing client (global "nexus-local"
 * DB) into the signed-in user's queue, then delete the legacy DB and cursor.
 * The legacy DB has no owner, so the first user to sign in on this browser
 * adopts it; the server re-authorizes every mutation, so a foreign one can only
 * end up in that user's rejected store, never be applied to data they can't
 * access.
 */
async function adoptLegacyQueue(target: LocalStoreLike, storage: KeyValueStorage | null): Promise<void> {
  storage?.removeItem(LEGACY_CURSOR_KEY);
  if (typeof indexedDB === "undefined") return;

  const legacy = await new Promise<IDBDatabase | null>((resolve) => {
    let created = false;
    const request = indexedDB.open(LEGACY_DB_NAME);
    request.onupgradeneeded = (event) => {
      // oldVersion 0: it never existed. Abort so we don't create it.
      if (event.oldVersion === 0) {
        created = true;
        request.transaction?.abort();
      }
    };
    request.onsuccess = () => {
      if (created) {
        request.result.close();
        resolve(null);
      } else {
        resolve(request.result);
      }
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  if (!legacy) return;

  try {
    if (legacy.objectStoreNames.contains("pending_mutations")) {
      const store = legacy.transaction("pending_mutations", "readonly").objectStore("pending_mutations");
      const queued = (await promisify(store.getAll())) as PendingMutation[];
      for (const mutation of queued) {
        if (mutation && typeof mutation.id === "string") await target.put("pending_mutations", mutation);
      }
    }
  } catch (error) {
    console.warn("[Sync] Could not read the legacy offline queue:", error);
    legacy.close();
    return; // keep the legacy DB so nothing is lost; retried next start
  }
  legacy.close();
  await deleteDatabase(LEGACY_DB_NAME);
}

// ==========================================
// SYNC ENGINE
// ==========================================

export interface SyncEngineOptions {
  /** "" (default) means same-origin relative URLs. */
  serverUrl?: string;
  userId?: string | null;
  localStore?: LocalStoreLike;
  storage?: KeyValueStorage | null;
  fetch?: typeof fetch;
  now?: () => number;
  isOnline?: () => boolean;
}

type Timer = ReturnType<typeof setTimeout>;

export class SyncEngine {
  private readonly localStore: LocalStoreLike;
  private readonly serverUrl: string;
  private readonly userId: string | null;
  private readonly storage: KeyValueStorage | null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly isOnline: () => boolean;

  private listeners = new Map<string, Set<() => void>>();
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private rejectionListeners = new Set<(rejection: RejectedMutation) => void>();
  private _status: SyncStatus = "disconnected";
  private _pendingMutations: PendingMutation[] = [];

  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private timers = new Set<Timer>();
  private eventSource: EventSource | null = null;
  private realtimeBackoff = 1_000;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  private lastSyncAttempt = 0;
  private syncBackoff = INITIAL_SYNC_BACKOFF_MS;
  private pushBackoff = INITIAL_PUSH_BACKOFF_MS;
  private pushRetryAt = 0;
  private fullResyncRequested = false;
  private isSyncing = false;
  private syncQueued = false;
  private destroyed = false;

  constructor(options: SyncEngineOptions | string = {}) {
    const opts = typeof options === "string" ? { serverUrl: options } : options;
    this.serverUrl = (opts.serverUrl ?? "").replace(/\/$/, "");
    this.userId = opts.userId ?? null;
    this.storage =
      opts.storage !== undefined ? opts.storage : typeof localStorage !== "undefined" ? localStorage : null;
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args));
    this.now = opts.now ?? Date.now;
    this.isOnline = opts.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine);
    this.localStore =
      opts.localStore ??
      (this.userId && typeof indexedDB !== "undefined"
        ? new IndexedDbLocalStore(localDbName(this.userId))
        : new MemoryLocalStore());
  }

  get status(): SyncStatus {
    return this._status;
  }

  get pendingCount(): number {
    return this._pendingMutations.length;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  private get cursorStorageKey(): string | null {
    return this.userId ? cursorKey(this.userId) : null;
  }

  /**
   * Opens the local store and loads the queue. With `background` (default),
   * also starts polling, the online/offline listeners and the SSE stream.
   * Safe to call after destroy(): it then does nothing.
   */
  async init(options: { background?: boolean } = {}): Promise<void> {
    if (this.destroyed) return;
    await this.localStore.init();
    if (this.destroyed) {
      this.localStore.close();
      return;
    }
    if (this.userId && !(this.localStore instanceof MemoryLocalStore)) {
      try {
        await adoptLegacyQueue(this.localStore, this.storage);
      } catch (error) {
        console.warn("[Sync] Legacy queue migration failed:", error);
      }
    }
    this._pendingMutations = (await this.localStore.getAll<PendingMutation>("pending_mutations")).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    if (this.destroyed || options.background === false) return;

    this.syncInterval = setInterval(() => void this.sync(), POLL_INTERVAL_MS);
    if (this.isOnline()) this.later(() => void this.sync(), 1000);

    this.onlineHandler = () => {
      this.later(() => void this.sync({ force: true }), 2000);
      this.connectRealtime();
    };
    this.offlineHandler = () => this.setStatus("disconnected");
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);

    this.connectRealtime();
  }

  private later(fn: () => void, ms: number): void {
    if (this.destroyed) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(timer);
  }

  private url(path: string): string {
    return `${this.serverUrl}${path}`;
  }

  // Server-sent change signals (Postgres NOTIFY -> SSE) trigger an immediate
  // pull; polling stays as the fallback.
  private connectRealtime(): void {
    if (this.destroyed || typeof EventSource === "undefined" || this.eventSource) return;
    try {
      const es = new EventSource(this.url("/api/sync/stream"));
      es.addEventListener("change", () => void this.sync({ force: true }));
      es.onopen = () => {
        this.realtimeBackoff = 1_000;
      };
      es.onerror = () => {
        es.close();
        if (this.eventSource === es) this.eventSource = null;
        if (this.isOnline()) {
          const delay = this.realtimeBackoff;
          this.realtimeBackoff = Math.min(this.realtimeBackoff * 2, MAX_SYNC_BACKOFF_MS);
          this.later(() => this.connectRealtime(), delay);
        }
      };
      this.eventSource = es;
    } catch {
      // SSE unavailable; polling continues.
    }
  }

  private setStatus(status: SyncStatus): void {
    if (this.destroyed) return;
    this._status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMutationRejected(listener: (rejection: RejectedMutation) => void): () => void {
    this.rejectionListeners.add(listener);
    return () => this.rejectionListeners.delete(listener);
  }

  async getRejectedMutations(): Promise<RejectedMutation[]> {
    return (await this.localStore.getAll<RejectedMutation>("rejected_mutations")).sort(
      (a, b) => a.rejectedAt - b.rejectedAt
    );
  }

  async dismissRejectedMutation(id: string): Promise<void> {
    await this.localStore.delete("rejected_mutations", id);
  }

  async sync(options: { force?: boolean } = {}): Promise<void> {
    if (this.destroyed) return;
    if (this.isSyncing) {
      if (options.force) this.syncQueued = true;
      return;
    }

    const now = this.now();
    if (!options.force && now - this.lastSyncAttempt < this.syncBackoff) return;

    if (!this.isOnline()) {
      this.setStatus("disconnected");
      return;
    }

    this.isSyncing = true;
    this.lastSyncAttempt = now;
    this.setStatus("syncing");

    try {
      // A push problem never blocks the pull, and vice versa.
      const pushOk = await this.pushPending();
      const pullOk = await this.pullData();

      if (pullOk) this.syncBackoff = INITIAL_SYNC_BACKOFF_MS;
      else this.syncBackoff = Math.min(this.syncBackoff * 2, MAX_SYNC_BACKOFF_MS);
      this.setStatus(pushOk && pullOk ? "connected" : "error");
    } catch (error) {
      console.error("[Sync] Error:", error);
      this.setStatus("error");
      this.syncBackoff = Math.min(this.syncBackoff * 2, MAX_SYNC_BACKOFF_MS);
    } finally {
      this.isSyncing = false;
      if (this.syncQueued && !this.destroyed) {
        this.syncQueued = false;
        void this.sync({ force: true });
      }
    }
  }

  /** Pushes the queue in order. Returns false when it stopped on a transient failure. */
  private async pushPending(): Promise<boolean> {
    if (this._pendingMutations.length === 0) return true;
    if (this.now() < this.pushRetryAt) return false;

    for (const mutation of [...this._pendingMutations]) {
      if (this.destroyed) return false;

      let response: Response;
      try {
        response = await this.fetchImpl(this.url("/api/sync/push"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(mutation),
        });
      } catch (error) {
        console.warn("[Sync] Push failed (network), will retry:", error);
        this.deferPush(null);
        return false;
      }

      const outcome = classifyPushStatus(response.status);
      if (outcome === "ok") {
        await this.removePending(mutation.id);
        continue;
      }
      if (outcome === "transient") {
        this.deferPush(parseRetryAfter(response.headers.get("Retry-After"), this.now()));
        return false;
      }
      await this.rejectMutation(mutation, response);
    }

    this.pushBackoff = INITIAL_PUSH_BACKOFF_MS;
    this.pushRetryAt = 0;
    return true;
  }

  private deferPush(retryAfterMs: number | null): void {
    const delay = Math.min(Math.max(retryAfterMs ?? 0, this.pushBackoff), MAX_PUSH_BACKOFF_MS);
    this.pushRetryAt = this.now() + delay;
    this.pushBackoff = Math.min(this.pushBackoff * 2, MAX_PUSH_BACKOFF_MS);
  }

  private async removePending(id: string): Promise<void> {
    await this.localStore.delete("pending_mutations", id);
    this._pendingMutations = this._pendingMutations.filter((m) => m.id !== id);
  }

  private async rejectMutation(mutation: PendingMutation, response: Response): Promise<void> {
    let body: Row = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") body = parsed as Row;
    } catch {
      // non-JSON error body
    }

    const rejection: RejectedMutation = {
      ...mutation,
      status: response.status,
      code: typeof body.code === "string" ? body.code : undefined,
      error: typeof body.error === "string" ? body.error : response.statusText || undefined,
      rejectedAt: this.now(),
    };
    // Record first, then dequeue: a crash in between re-pushes (idempotent on
    // the server) rather than losing the record.
    await this.localStore.put("rejected_mutations", rejection);
    await this.removePending(mutation.id);

    // Undo the optimistic local change.
    const rowId = typeof mutation.data.id === "string" ? mutation.data.id : null;
    const current = body.current;
    if (current && typeof current === "object" && typeof (current as Row).id === "string") {
      await this.localStore.put(mutation.table, current as { id: string });
    } else if (rowId && (mutation.operation === "insert" || response.status === 403 || response.status === 404)) {
      // Never created on the server, or no longer visible to this user.
      await this.localStore.delete(mutation.table, rowId);
    } else {
      // No server copy to restore from: re-read everything on this pull.
      this.fullResyncRequested = true;
    }
    this.notifyListeners(mutation.table);
    this.rejectionListeners.forEach((listener) => listener(rejection));
  }

  /** Returns false when the pull did not complete. */
  private async pullData(): Promise<boolean> {
    const key = this.cursorStorageKey;
    const stored = key ? Number(this.storage?.getItem(key) ?? 0) : 0;
    const cursor = Number.isFinite(stored) ? stored : 0;
    const since = this.fullResyncRequested || cursor <= 0 ? 0 : Math.max(0, cursor - PULL_OVERLAP_MS);

    try {
      const response = await this.fetchImpl(this.url(`/api/sync/pull?since=${since}`), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) {
        if (response.status === 429) console.warn("[Sync] Pull rate limited, backing off");
        return false;
      }

      const data = (await response.json()) as Row;
      if (this.destroyed) return false;

      for (const [responseKey, records] of Object.entries(data)) {
        if (!Array.isArray(records)) continue;
        const table = PULL_TABLE_MAP[responseKey] ?? responseKey;
        for (const record of records) {
          if (!record || typeof record !== "object" || typeof record.id !== "string") continue;
          const merged = this.overlayPending(table, record as Row);
          if (merged) await this.localStore.put(table, merged as { id: string });
        }
        this.notifyListeners(table);
      }

      // Cursor = server clock (taken before its queries ran). Older servers
      // only send `lastSync`. Never the browser clock.
      const serverTime =
        typeof data.serverTime === "number" ? data.serverTime : typeof data.lastSync === "number" ? data.lastSync : null;
      if (key && serverTime !== null && !this.destroyed) this.storage?.setItem(key, String(serverTime));
      this.fullResyncRequested = false;
      return true;
    } catch (error) {
      console.warn("[Sync] Pull failed, continuing offline:", error);
      return false;
    }
  }

  /**
   * A pulled row must not wipe local edits that are still queued (e.g. while
   * pushes are backing off): re-apply them on top. Returns null when a queued
   * delete means the row should stay gone locally.
   */
  private overlayPending(table: string, record: Row): Row | null {
    let merged = record;
    for (const mutation of this._pendingMutations) {
      if (mutation.table !== table || mutation.data.id !== record.id) continue;
      if (mutation.operation === "delete") return null;
      merged = { ...merged, ...mutation.data };
    }
    return merged;
  }

  /** Optimistic mutation: updates the local cache now and queues the push. */
  async mutate<T extends { id: string }>(
    table: string,
    operation: "insert" | "update" | "delete",
    data: T
  ): Promise<void> {
    if (this.destroyed) throw new Error("Sync engine destroyed");
    const now = this.now();
    const row = data as unknown as Row;

    let payload: Row = row;
    let base: MutationBase | undefined;
    const cached = operation === "update" ? await this.localStore.get<Row>(table, data.id) : null;

    if (operation === "update" && cached) {
      const changes = diffFields(cached, row);
      if (Object.keys(changes).length === 0) return; // nothing changed
      payload = {
        id: data.id,
        ...(cached.workspaceId !== undefined ? { workspaceId: cached.workspaceId } : {}),
        ...changes,
      };
      base = {
        updatedAt: typeof cached.updatedAt === "number" ? cached.updatedAt : undefined,
        fields: Object.fromEntries(Object.keys(changes).map((k) => [k, cached[k] ?? null])),
      };
    }

    if (operation === "delete") {
      await this.localStore.delete(table, data.id);
    } else {
      await this.localStore.put(table, {
        ...(cached ?? {}),
        ...row,
        id: data.id,
        updatedAt: now,
        ...(operation === "insert" ? { createdAt: now } : {}),
      });
    }
    this.notifyListeners(table);

    const mutation: PendingMutation = {
      id: crypto.randomUUID(),
      table,
      operation,
      data: payload,
      timestamp: now,
      ...(base ? { base } : {}),
    };
    this._pendingMutations.push(mutation);
    await this.localStore.put("pending_mutations", mutation);

    if (this.isOnline()) await this.sync({ force: true });
  }

  /**
   * Write a row the server has already accepted (e.g. after a successful REST
   * call) into the local cache only. Nothing is queued or pushed.
   */
  async applyServerRow<T extends { id: string }>(table: string, row: T): Promise<void> {
    if (this.destroyed) return;
    await this.localStore.put(table, row);
    this.notifyListeners(table);
  }

  async query<T>(table: string, workspaceId?: string): Promise<T[]> {
    if (workspaceId) return this.localStore.getByWorkspace<T>(table, workspaceId);
    return this.localStore.getAll<T>(table);
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    return this.localStore.get<T>(table, id);
  }

  subscribe(table: string, callback: () => void): () => void {
    if (!this.listeners.has(table)) this.listeners.set(table, new Set());
    this.listeners.get(table)!.add(callback);
    return () => {
      this.listeners.get(table)?.delete(callback);
    };
  }

  private notifyListeners(table: string): void {
    if (this.destroyed) return;
    this.listeners.get(table)?.forEach((callback) => callback());
  }

  /** Stops all background work and removes every listener. Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = null;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.eventSource?.close();
    this.eventSource = null;
    if (typeof window !== "undefined") {
      if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler);
      if (this.offlineHandler) window.removeEventListener("offline", this.offlineHandler);
    }
    this.onlineHandler = null;
    this.offlineHandler = null;
    this.listeners.clear();
    this.statusListeners.clear();
    this.rejectionListeners.clear();
    this.localStore.close();
  }

  /**
   * Sign-out: stop the engine and delete this user's cache, queue, rejected
   * store and pull cursor. Call flush() first to push what can still be pushed.
   */
  async clearLocalData(): Promise<void> {
    this.destroy();
    this._pendingMutations = [];
    await this.localStore.destroy();
    const key = this.cursorStorageKey;
    if (key) this.storage?.removeItem(key);
  }

  /** Best-effort final push+pull, e.g. before sign-out. */
  async flush(): Promise<void> {
    this.pushRetryAt = 0;
    await this.sync({ force: true });
  }
}
