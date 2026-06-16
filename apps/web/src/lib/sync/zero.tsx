"use client";

/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Local-First Sync Client
 *
 * A self-contained offline-first data layer (no external sync service required,
 * so it runs on serverless hosting). Implements:
 * - Offline-first: reads come from IndexedDB and work with no network
 * - Optimistic UI: mutations update the local store immediately
 * - Background sync: pending mutations are pushed and fresh data pulled via the
 *   REST sync API (/api/sync/push and /api/sync/pull) when online
 *
 * Conflict policy: last-write-wins by `updatedAt` (server upsert wins on push,
 * newer pulled rows overwrite local). This is NOT a CRDT — concurrent edits to
 * the same field resolve to the last writer, which is acceptable for the
 * doc/task metadata synced here. Doc *body* collaboration uses Yjs separately.
 *
 * Note: the subscription hooks intentionally call refresh() in useEffect to load
 * initial data, then subscribe for updates — a valid external-store pattern.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface Doc {
  id: string;
  workspaceId: string;
  title: string;
  content: unknown;
  icon?: string;
  iconEmoji?: string;
  coverUrl?: string;
  parentId?: string;
  isArchived: boolean;
  creatorId?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high" | "urgent";
  assigneeId?: string;
  assigneeAgentType?: string;
  creatorId?: string;
  createdBy?: string;
  dueDate?: number;
  completedAt?: number;
  position?: number;
  docId?: string;
  isArchived?: number | boolean;
  alignmentStatus?: "aligned" | "needs_review" | "orphaned";
  alignmentUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  description?: string;
  ownerId?: string;
  iconUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  avatarUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AgentExecution {
  id: string;
  workspaceId: string;
  agentType: string;
  status: "pending" | "running" | "completed" | "failed";
  input: string;
  output?: string;
  errorMessage?: string;
  temporalWorkflowId?: string;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  workspaceId?: string;
  conversationId?: string;
  executionId?: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: unknown;
  createdAt: number;
}

// Alias for backward compatibility
export type Message = ChatMessage;

// ==========================================
// SYNC STATUS
// ==========================================

export type SyncStatus = "connecting" | "connected" | "disconnected" | "syncing" | "error";

interface PendingMutation {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  data: Record<string, unknown>;
  timestamp: number;
}

// ==========================================
// LOCAL STORAGE (IndexedDB Wrapper)
// ==========================================

class LocalStore {
  private dbName = "nexus-local";
  private dbVersion = 3; // Incremented to force schema rebuild
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (typeof window === "undefined") return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        // If there's an error, try to delete and recreate the database
        console.warn("[Zero] Database error, attempting recovery...");
        indexedDB.deleteDatabase(this.dbName);
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Delete all existing stores on upgrade
        const existingStores = Array.from(db.objectStoreNames);
        existingStores.forEach((store) => {
          try {
            db.deleteObjectStore(store);
          } catch {
            // Ignore if store doesn't exist
          }
        });

        // Create object stores for each table
        const stores = ["docs", "tasks", "workspaces", "users", "agent_executions", "chat_messages", "pending_mutations"];
        stores.forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            const objectStore = db.createObjectStore(store, { keyPath: "id" });
            if (store !== "pending_mutations") {
              objectStore.createIndex("workspaceId", "workspaceId", { unique: false });
              objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
            }
          }
        });
      };
    });
  }

  private hasStore(table: string): boolean {
    return this.db !== null && this.db.objectStoreNames.contains(table);
  }

  async getAll<T>(table: string): Promise<T[]> {
    if (!this.db || !this.hasStore(table)) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readonly");
        const store = transaction.objectStore(table);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      } catch {
        resolve([]);
      }
    });
  }

  async getByWorkspace<T>(table: string, workspaceId: string): Promise<T[]> {
    if (!this.db || !this.hasStore(table)) return [];

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readonly");
        const store = transaction.objectStore(table);
        const index = store.index("workspaceId");
        const request = index.getAll(workspaceId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T[]);
      } catch {
        resolve([]);
      }
    });
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    if (!this.db || !this.hasStore(table)) return null;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readonly");
        const store = transaction.objectStore(table);
        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as T | null);
      } catch {
        resolve(null);
      }
    });
  }

  async put<T extends { id: string }>(table: string, data: T): Promise<void> {
    if (!this.db || !this.hasStore(table)) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readwrite");
        const store = transaction.objectStore(table);
        const request = store.put(data);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.db || !this.hasStore(table)) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readwrite");
        const store = transaction.objectStore(table);
        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async clear(table: string): Promise<void> {
    if (!this.db || !this.hasStore(table)) return;

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction(table, "readwrite");
        const store = transaction.objectStore(table);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

// ==========================================
// SYNC ENGINE
// ==========================================

class SyncEngine {
  private localStore: LocalStore;
  private serverUrl: string;
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<() => void>> = new Map();
  private _status: SyncStatus = "disconnected";
  private _pendingMutations: PendingMutation[] = [];
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private eventSource: EventSource | null = null;
  private lastSyncAttempt: number = 0;
  private syncBackoff: number = 5000; // Start with 5 seconds
  private maxBackoff: number = 60000; // Max 1 minute
  private isSyncing: boolean = false;

  constructor(serverUrl: string) {
    this.localStore = new LocalStore();
    this.serverUrl = serverUrl;
  }

  get status(): SyncStatus {
    return this._status;
  }

  get pendingCount(): number {
    return this._pendingMutations.length;
  }

  async init(): Promise<void> {
    await this.localStore.init();
    this._pendingMutations = await this.localStore.getAll<PendingMutation>("pending_mutations");
    
    // Start sync interval with backoff protection
    this.syncInterval = setInterval(() => this.sync(), 10000); // Increased to 10 seconds

    // Initial sync with delay to avoid rate limiting
    if (navigator.onLine) {
      setTimeout(() => this.sync(), 1000);
    }

    // Listen for online/offline
    window.addEventListener("online", () => {
      // Delay sync after coming online to avoid burst
      setTimeout(() => this.sync(), 2000);
      this.connectRealtime();
    });
    window.addEventListener("offline", () => this.setStatus("disconnected"));

    // Near-real-time updates: when the server signals a change in one of our
    // workspaces, pull immediately instead of waiting for the 10s poll. The
    // interval above stays as a fallback, so this is a pure enhancement.
    this.connectRealtime();
  }

  // Subscribe to server-sent change signals (Postgres NOTIFY -> SSE).
  private connectRealtime(): void {
    if (typeof EventSource === "undefined" || this.eventSource) return;
    try {
      const es = new EventSource(`${this.serverUrl}/api/sync/stream`);
      es.addEventListener("change", () => {
        // A doc/task changed in one of our workspaces — sync now.
        this.sync();
      });
      es.onerror = () => {
        // Connection dropped (offline, restart, or unsupported). Close and let
        // the browser/our online handler reconnect; polling keeps working.
        es.close();
        if (this.eventSource === es) this.eventSource = null;
      };
      this.eventSource = es;
    } catch {
      // SSE unavailable — polling continues as the fallback.
    }
  }

  private setStatus(status: SyncStatus): void {
    this._status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  onStatusChange(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async sync(): Promise<void> {
    // Prevent concurrent syncs
    if (this.isSyncing) return;
    
    // Check backoff timing
    const now = Date.now();
    if (now - this.lastSyncAttempt < this.syncBackoff) {
      return;
    }
    
    if (!navigator.onLine) {
      this.setStatus("disconnected");
      return;
    }

    this.isSyncing = true;
    this.lastSyncAttempt = now;
    this.setStatus("syncing");

    try {
      // Push pending mutations
      for (const mutation of this._pendingMutations) {
        await this.pushMutation(mutation);
        await this.localStore.delete("pending_mutations", mutation.id);
        this._pendingMutations = this._pendingMutations.filter((m) => m.id !== mutation.id);
      }

      // Pull latest data from server
      await this.pullData();

      this.setStatus("connected");
      // Reset backoff on success
      this.syncBackoff = 5000;
    } catch (error) {
      console.error("[Sync] Error:", error);
      this.setStatus("error");
      // Increase backoff on error (exponential)
      this.syncBackoff = Math.min(this.syncBackoff * 2, this.maxBackoff);
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushMutation(mutation: PendingMutation): Promise<void> {
    const response = await fetch(`${this.serverUrl}/api/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.statusText}`);
    }
  }

  private async pullData(): Promise<void> {
    // Get last sync timestamp from localStorage
    const lastSync = localStorage.getItem("nexus-last-sync") || "0";

    try {
      const response = await fetch(`${this.serverUrl}/api/sync/pull?since=${lastSync}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      // Handle rate limiting specifically
      if (response.status === 429) {
        console.warn("[Sync] Rate limited, increasing backoff");
        this.syncBackoff = Math.min(this.syncBackoff * 2, this.maxBackoff);
        return;
      }

      if (response.ok) {
        const data = await response.json();

        // Update local store with pulled data
        for (const table of Object.keys(data)) {
          if (Array.isArray(data[table])) {
            for (const record of data[table]) {
              await this.localStore.put(table, record);
            }
            this.notifyListeners(table);
          }
        }

        // Update last sync timestamp
        localStorage.setItem("nexus-last-sync", Date.now().toString());
      }
    } catch (error) {
      // Pull failed, but we can still work offline
      console.warn("[Sync] Pull failed, continuing offline:", error);
    }
  }

  // Optimistic mutation - updates local immediately, syncs later
  async mutate<T extends { id: string }>(
    table: string,
    operation: "insert" | "update" | "delete",
    data: T
  ): Promise<void> {
    const now = Date.now();

    // Update local store immediately (optimistic)
    if (operation === "delete") {
      await this.localStore.delete(table, data.id);
    } else {
      await this.localStore.put(table, {
        ...data,
        updatedAt: now,
        ...(operation === "insert" ? { createdAt: now } : {}),
      });
    }

    // Notify listeners
    this.notifyListeners(table);

    // Queue mutation for sync
    const mutation: PendingMutation = {
      id: crypto.randomUUID(),
      table,
      operation,
      data: data as Record<string, unknown>,
      timestamp: now,
    };

    this._pendingMutations.push(mutation);
    await this.localStore.put("pending_mutations", mutation);

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.sync();
    }
  }

  async query<T>(table: string, workspaceId?: string): Promise<T[]> {
    if (workspaceId) {
      return this.localStore.getByWorkspace<T>(table, workspaceId);
    }
    return this.localStore.getAll<T>(table);
  }

  async get<T>(table: string, id: string): Promise<T | null> {
    return this.localStore.get<T>(table, id);
  }

  subscribe(table: string, callback: () => void): () => void {
    if (!this.listeners.has(table)) {
      this.listeners.set(table, new Set());
    }
    this.listeners.get(table)!.add(callback);

    return () => {
      this.listeners.get(table)?.delete(callback);
    };
  }

  private notifyListeners(table: string): void {
    this.listeners.get(table)?.forEach((callback) => callback());
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.ws?.close();
  }
}

// ==========================================
// REACT CONTEXT
// ==========================================

interface ZeroContextType {
  engine: SyncEngine | null;
  status: SyncStatus;
  isOnline: boolean;
  pendingMutations: number;
  lastSyncedAt: Date | null;
}

const ZeroContext = createContext<ZeroContextType>({
  engine: null,
  status: "disconnected",
  isOnline: false,
  pendingMutations: 0,
  lastSyncedAt: null,
});

// ==========================================
// PROVIDER
// ==========================================

interface ZeroProviderProps {
  children: ReactNode;
  serverUrl?: string;
}

export function ZeroProvider({ children, serverUrl }: ZeroProviderProps) {
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const url = serverUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const syncEngine = new SyncEngine(url);

    syncEngine.init().then(() => {
      setEngine(syncEngine);
      setStatus(syncEngine.status);
      setPendingMutations(syncEngine.pendingCount);
    });

    const unsubscribe = syncEngine.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setPendingMutations(syncEngine.pendingCount);
      if (newStatus === "connected") {
        setLastSyncedAt(new Date());
      }
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubscribe();
      syncEngine.destroy();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [serverUrl]);

  return (
    <ZeroContext.Provider
      value={{
        engine,
        status,
        isOnline,
        pendingMutations,
        lastSyncedAt,
      }}
    >
      {children}
    </ZeroContext.Provider>
  );
}

// ==========================================
// HOOKS
// ==========================================

export function useZero() {
  return useContext(ZeroContext);
}

export function useZeroStatus() {
  const { status, isOnline, pendingMutations, lastSyncedAt } = useZero();
  return {
    status,
    isOnline,
    pendingMutations,
    lastSyncedAt,
    isConnected: status === "connected",
    isSyncing: status === "syncing",
  };
}

/**
 * Hook for querying documents with real-time updates
 */
export function useDocs(workspaceId?: string) {
  const { engine } = useZero();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!engine) return;
    const data = await engine.query<Doc>("docs", workspaceId);
    setDocs(data.filter((d) => !d.isArchived).sort((a, b) => b.updatedAt - a.updatedAt));
    setIsLoading(false);
  }, [engine, workspaceId]);

  useEffect(() => {
    if (!engine) return;
    // Initial load
    void refresh();
    // Subscribe for updates
    return engine.subscribe("docs", refresh);
  }, [engine, refresh]);

  const createDoc = useCallback(
    async (doc: Omit<Doc, "id" | "createdAt" | "updatedAt">) => {
      if (!engine) throw new Error("Not initialized");
      const id = crypto.randomUUID();
      const now = Date.now();
      await engine.mutate("docs", "insert", { id, ...doc, createdAt: now, updatedAt: now });
      return id;
    },
    [engine]
  );

  const updateDoc = useCallback(
    async (id: string, updates: Partial<Doc>) => {
      if (!engine) throw new Error("Not initialized");
      const existing = await engine.get<Doc>("docs", id);
      if (!existing) throw new Error("Doc not found");
      await engine.mutate("docs", "update", { ...existing, ...updates, id });
    },
    [engine]
  );

  const deleteDoc = useCallback(
    async (id: string) => {
      if (!engine) throw new Error("Not initialized");
      // Soft delete - mark as archived
      const existing = await engine.get<Doc>("docs", id);
      if (existing) {
        await engine.mutate("docs", "update", { ...existing, isArchived: true });
      }
    },
    [engine]
  );

  return { docs, isLoading, createDoc, updateDoc, deleteDoc, refresh };
}

/**
 * Hook for querying tasks with real-time updates
 */
export function useTasks(workspaceId?: string, filterStatus?: Task["status"]) {
  const { engine } = useZero();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!engine) return;
    let data = await engine.query<Task>("tasks", workspaceId);
    if (filterStatus) {
      data = data.filter((t) => t.status === filterStatus);
    }
    setTasks(data.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
    setIsLoading(false);
  }, [engine, workspaceId, filterStatus]);

  useEffect(() => {
    if (!engine) return;
    // Initial load
    void refresh();
    // Subscribe for updates
    return engine.subscribe("tasks", refresh);
  }, [engine, refresh]);

  const createTask = useCallback(
    async (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
      if (!engine) throw new Error("Not initialized");
      const id = crypto.randomUUID();
      const now = Date.now();
      await engine.mutate("tasks", "insert", { id, ...task, createdAt: now, updatedAt: now });
      return id;
    },
    [engine]
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>) => {
      if (!engine) throw new Error("Not initialized");
      const existing = await engine.get<Task>("tasks", id);
      if (!existing) throw new Error("Task not found");
      await engine.mutate("tasks", "update", { ...existing, ...updates, id });
    },
    [engine]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      if (!engine) throw new Error("Not initialized");
      await engine.mutate("tasks", "delete", { id } as Task);
    },
    [engine]
  );

  return { tasks, isLoading, createTask, updateTask, deleteTask, refresh };
}

/**
 * Hook for querying workspaces with real-time updates
 */
export function useWorkspaces(userId?: string) {
  const { engine } = useZero();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!engine) return;
    let data = await engine.query<Workspace>("workspaces");
    if (userId) {
      data = data.filter((w) => w.ownerId === userId);
    }
    setWorkspaces(data.sort((a, b) => b.updatedAt - a.updatedAt));
    setIsLoading(false);
  }, [engine, userId]);

  useEffect(() => {
    if (!engine) return;
    // Initial load
    void refresh();
    // Subscribe for updates
    return engine.subscribe("workspaces", refresh);
  }, [engine, refresh]);

  const createWorkspace = useCallback(
    async (workspace: Omit<Workspace, "id" | "createdAt" | "updatedAt">) => {
      if (!engine) throw new Error("Not initialized");
      const id = crypto.randomUUID();
      const now = Date.now();
      await engine.mutate("workspaces", "insert", { id, ...workspace, createdAt: now, updatedAt: now });
      return id;
    },
    [engine]
  );

  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<Workspace>) => {
      if (!engine) throw new Error("Not initialized");
      const existing = await engine.get<Workspace>("workspaces", id);
      if (!existing) throw new Error("Workspace not found");
      await engine.mutate("workspaces", "update", { ...existing, ...updates, id });
    },
    [engine]
  );

  return { workspaces, isLoading, createWorkspace, updateWorkspace, refresh };
}

/**
 * Hook for querying agent executions
 */
export function useAgentExecutions(workspaceId: string) {
  const { engine } = useZero();
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!engine) return;
    const data = await engine.query<AgentExecution>("agent_executions", workspaceId);
    setExecutions(data.sort((a, b) => b.createdAt - a.createdAt));
    setIsLoading(false);
  }, [engine, workspaceId]);

  useEffect(() => {
    if (!engine) return;
    // Initial load
    void refresh();
    // Subscribe for updates
    return engine.subscribe("agent_executions", refresh);
  }, [engine, refresh]);

  return { executions, isLoading, refresh };
}

/**
 * Hook for querying chat messages
 */
export function useChatMessages(workspaceId: string, executionId?: string) {
  const { engine } = useZero();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!engine) return;
    let data = await engine.query<ChatMessage>("chat_messages", workspaceId);
    if (executionId) {
      data = data.filter((m) => m.executionId === executionId);
    }
    setMessages(data.sort((a, b) => a.createdAt - b.createdAt));
    setIsLoading(false);
  }, [engine, workspaceId, executionId]);

  useEffect(() => {
    if (!engine) return;
    // Initial load
    void refresh();
    // Subscribe for updates
    return engine.subscribe("chat_messages", refresh);
  }, [engine, refresh]);

  const sendMessage = useCallback(
    async (message: Omit<ChatMessage, "id" | "createdAt">) => {
      if (!engine) throw new Error("Not initialized");
      const id = crypto.randomUUID();
      const now = Date.now();
      await engine.mutate("chat_messages", "insert", { id, ...message, createdAt: now });
      return id;
    },
    [engine]
  );

  return { messages, isLoading, sendMessage, refresh };
}

/**
 * Optimistic update helper for custom mutations
 */
export function useOptimisticUpdate<T>(
  initialData: T,
  syncFn: (data: T) => Promise<void>
) {
  const [data, setData] = useState<T>(initialData);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const previousDataRef = useRef<T>(initialData);

  const update = useCallback(
    async (newData: T) => {
      previousDataRef.current = data;
      setData(newData);
      setIsPending(true);
      setError(null);

      try {
        await syncFn(newData);
      } catch (err) {
        setData(previousDataRef.current);
        setError(err instanceof Error ? err : new Error("Sync failed"));
      } finally {
        setIsPending(false);
      }
    },
    [data, syncFn]
  );

  return { data, update, isPending, error };
}
