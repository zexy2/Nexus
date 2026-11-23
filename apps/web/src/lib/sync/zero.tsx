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
 * Conflict policy: updates send only changed fields plus the cached base
 * values; the server merges per field and rejects (409 STALE_BASE) when
 * another user changed the same field in between. Rejected mutations are kept
 * in a local "rejected" store, surfaced as a toast and listed in the
 * sync-issues panel (components/shared/sync-issues-panel.tsx), where they can
 * be retried or discarded. See ./engine.ts and
 * app/api/sync/push/route.ts. Doc *body* collaboration uses Yjs separately.
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
import { SyncEngine, type SyncStatus, type RejectedMutation } from "./engine";
import { showToast } from "@/components/shared/toast-provider";
import { useT } from "@/lib/i18n/provider";

export { SyncEngine };

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
  /** 0/1 from the server, boolean after a local toggle. */
  isFavorite?: number | boolean;
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
  status: "todo" | "in_progress" | "in_review" | "done";
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

// The engine itself (queue, push classification, pull cursor, per-user
// storage) lives in ./engine so it can be tested without React.
export type { SyncStatus, PendingMutation, RejectedMutation } from "./engine";

// ==========================================
// REACT CONTEXT
// ==========================================

interface ZeroContextType {
  engine: SyncEngine | null;
  status: SyncStatus;
  isOnline: boolean;
  pendingMutations: number;
  /** Mutations in the rejected store (shown in the sync-issues panel). */
  rejectedMutations: number;
  lastSyncedAt: Date | null;
}

const ZeroContext = createContext<ZeroContextType>({
  engine: null,
  status: "disconnected",
  isOnline: false,
  pendingMutations: 0,
  rejectedMutations: 0,
  lastSyncedAt: null,
});

// ==========================================
// PROVIDER
// ==========================================

interface ZeroProviderProps {
  children: ReactNode;
  /** Absolute sync origin; omit for same-origin relative URLs (the default). */
  serverUrl?: string;
  /** Signed-in user. The local DB and pull cursor are namespaced by it. */
  userId?: string | null;
}

export function ZeroProvider({ children, serverUrl, userId }: ZeroProviderProps) {
  const t = useT();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [rejectedMutations, setRejectedMutations] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    const syncEngine = new SyncEngine({ serverUrl: serverUrl ?? "", userId: userId ?? null });

    const unsubscribeStatus = syncEngine.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setPendingMutations(syncEngine.pendingCount);
      if (newStatus === "connected") setLastSyncedAt(new Date());
    });
    const unsubscribeRejected = syncEngine.onMutationRejected((rejection: RejectedMutation) => {
      setPendingMutations(syncEngine.pendingCount);
      if (rejection.reason === "server_error") {
        showToast.error(tRef.current("syncStatus.changeParked"), {
          description: tRef.current("syncStatus.changeParkedDescription"),
        });
        return;
      }
      showToast.error(tRef.current("syncStatus.changeRejected"), {
        description: rejection.error || tRef.current("syncStatus.changeRejectedDescription"),
      });
    });
    const unsubscribeRejectedCount = syncEngine.onRejectedCountChange((count) => {
      setRejectedMutations(count);
      setPendingMutations(syncEngine.pendingCount);
    });

    syncEngine
      .init()
      .then(() => {
        if (syncEngine.isDestroyed) return;
        setEngine(syncEngine);
        setStatus(syncEngine.status);
        setPendingMutations(syncEngine.pendingCount);
        setRejectedMutations(syncEngine.rejectedCount);
      })
      .catch((error) => {
        console.error("[Sync] Local store unavailable:", error);
        setStatus("error");
      });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      unsubscribeStatus();
      unsubscribeRejected();
      unsubscribeRejectedCount();
      syncEngine.destroy();
      setEngine((current) => (current === syncEngine ? null : current));
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [serverUrl, userId]);

  return (
    <ZeroContext.Provider
      value={{
        engine,
        status,
        isOnline,
        pendingMutations,
        rejectedMutations,
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
  const { status, isOnline, pendingMutations, rejectedMutations, lastSyncedAt } = useZero();
  return {
    status,
    isOnline,
    pendingMutations,
    rejectedMutations,
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
