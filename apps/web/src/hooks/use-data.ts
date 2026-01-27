"use client";

/**
 * Data Hooks - API-based data fetching with real-time updates
 * 
 * These hooks connect to the actual API endpoints and database.
 * For local-first sync, use the hooks from @/lib/zero.tsx instead.
 */

import { useCallback, useMemo, useEffect, useState } from "react";
import type { Doc, Task, Workspace, AgentExecution, ChatMessage } from "@/lib/zero";

// ==========================================
// GENERIC FETCH HOOK
// ==========================================

interface UseApiDataOptions {
  enabled?: boolean;
  refreshInterval?: number;
}

function useApiData<T>(url: string, options?: UseApiDataOptions) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (options?.enabled === false) return;
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : json.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [url, options?.enabled]);

  useEffect(() => {
    fetchData();
    
    if (options?.refreshInterval) {
      const interval = setInterval(fetchData, options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, options?.refreshInterval]);

  return { data, isLoading, error, refetch: fetchData };
}

// ==========================================
// WORKSPACE HOOKS
// ==========================================

export function useWorkspaces() {
  const { data, isLoading, error, refetch } = useApiData<Workspace>("/api/workspaces");
  
  return useMemo(() => ({
    workspaces: [...data].sort((a, b) => b.createdAt - a.createdAt),
    isLoading,
    error,
    refetch,
  }), [data, isLoading, error, refetch]);
}

export function useWorkspace(id: string) {
  const { workspaces, isLoading } = useWorkspaces();
  return useMemo(() => ({
    workspace: workspaces.find(w => w.id === id),
    isLoading,
  }), [workspaces, id, isLoading]);
}

// ==========================================
// DOCUMENT HOOKS
// ==========================================

export function useDocs(workspaceId?: string) {
  const url = workspaceId ? `/api/docs?workspaceId=${workspaceId}` : "/api/docs";
  const { data } = useApiData<Doc>(url, { 
    enabled: true,
    refreshInterval: 30000 
  });

  return useMemo(() => 
    data
      .filter(d => !d.isArchived)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [data]
  );
}

export function useDoc(id: string) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/api/docs/${id}`);
        if (res.ok) {
          setDoc(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch doc:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (id) fetchDoc();
  }, [id]);

  return { doc, isLoading };
}

export function useChildDocs(parentId: string) {
  const docs = useDocs();
  return useMemo(() => 
    docs
      .filter(d => d.parentId === parentId && !d.isArchived)
      .sort((a, b) => a.title.localeCompare(b.title)),
    [docs, parentId]
  );
}

// ==========================================
// TASK HOOKS
// ==========================================

export function useTasks(workspaceId?: string) {
  const url = workspaceId ? `/api/tasks?workspaceId=${workspaceId}` : "/api/tasks";
  const { data } = useApiData<Task>(url, {
    enabled: true,
    refreshInterval: 30000
  });

  return useMemo(() => 
    [...data].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [data]
  );
}

export function useTasksByStatus(workspaceId: string, status: string) {
  const tasks = useTasks(workspaceId);
  return useMemo(() => 
    tasks.filter(t => t.status === status).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tasks, status]
  );
}

export function useTask(id: string) {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTask() {
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (res.ok) {
          setTask(await res.json());
        }
      } catch (err) {
        console.error("Failed to fetch task:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (id) fetchTask();
  }, [id]);

  return { task, isLoading };
}

// ==========================================
// AGENT EXECUTION HOOKS
// ==========================================

export function useAgentExecutions(workspaceId?: string) {
  const url = workspaceId 
    ? `/api/agents/executions?workspaceId=${workspaceId}` 
    : "/api/agents/executions";
  const { data, isLoading, error, refetch } = useApiData<AgentExecution>(url, {
    refreshInterval: 10000 // Refresh every 10 seconds
  });

  return useMemo(() => ({
    executions: [...data].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)),
    isLoading,
    error,
    refetch,
  }), [data, isLoading, error, refetch]);
}

export function useRunningExecutions(workspaceId?: string) {
  const { executions } = useAgentExecutions(workspaceId);
  return useMemo(() => 
    executions.filter(e => e.status === "running"),
    [executions]
  );
}

// ==========================================
// CHAT MESSAGE HOOKS
// ==========================================

export function useChatMessages(workspaceId: string, executionId?: string) {
  const url = executionId 
    ? `/api/chat/messages?workspaceId=${workspaceId}&executionId=${executionId}`
    : `/api/chat/messages?workspaceId=${workspaceId}`;
  
  const { data, isLoading, error, refetch } = useApiData<ChatMessage>(url, {
    refreshInterval: 5000
  });

  return useMemo(() => ({
    messages: [...data].sort((a, b) => a.createdAt - b.createdAt),
    isLoading,
    error,
    refetch,
  }), [data, isLoading, error, refetch]);
}

// ==========================================
// MUTATION HELPERS
// ==========================================

export function useCreateDoc() {
  return useCallback(async (doc: Omit<Doc, "id" | "createdAt" | "updatedAt">) => {
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) throw new Error("Failed to create document");
    const data = await res.json();
    return data.id;
  }, []);
}

export function useUpdateDoc() {
  return useCallback(async (id: string, updates: Partial<Doc>) => {
    const res = await fetch(`/api/docs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update document");
  }, []);
}

export function useDeleteDoc() {
  return useCallback(async (id: string) => {
    const res = await fetch(`/api/docs/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete document");
  }, []);
}

export function useCreateTask() {
  return useCallback(async (task: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error("Failed to create task");
    const data = await res.json();
    return data.id;
  }, []);
}

export function useUpdateTask() {
  return useCallback(async (id: string, updates: Partial<Task>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update task");
  }, []);
}

export function useDeleteTask() {
  return useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete task");
  }, []);
}

export function useCreateWorkspace() {
  return useCallback(async (workspace: Omit<Workspace, "id" | "createdAt" | "updatedAt">) => {
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspace),
    });
    if (!res.ok) throw new Error("Failed to create workspace");
    const data = await res.json();
    return data.id;
  }, []);
}

export function useSendMessage() {
  return useCallback(async (message: {
    workspaceId: string;
    executionId?: string;
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) => {
    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error("Failed to send message");
    const data = await res.json();
    return data.id;
  }, []);
}
