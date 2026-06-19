/**
 * useOfflineData Hook
 * 
 * React hook for offline-first data fetching with optimistic updates.
 * Provides instant UI updates with background sync.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  setLocal,
  getAllLocal,
  deleteLocal,
  queueChange,
  syncPendingChanges,
  isOnline,
  onConnectivityChange,
} from "@/lib/sync/offline";

type StoreName = "docs" | "tasks";

interface UseOfflineDataOptions {
  store: StoreName;
  fetchUrl: string;
  enabled?: boolean;
  onSync?: (synced: number, failed: number) => void;
}

interface UseOfflineDataResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  isOffline: boolean;
  hasPendingChanges: boolean;
  create: (item: Omit<T, "id"> & { id?: string }) => Promise<T>;
  update: (id: string, updates: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
}

export function useOfflineData<T extends { id: string }>(
  options: UseOfflineDataOptions
): UseOfflineDataResult<T> {
  const { store, fetchUrl, enabled = true, onSync } = options;

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  
  const syncingRef = useRef(false);

  // Load data from local cache first, then fetch from server
  const loadData = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);

      // Load from local cache immediately
      const localData = await getAllLocal<T>(store);
      if (localData.length > 0) {
        setData(localData);
        setIsLoading(false);
      }

      // If online, fetch fresh data
      if (isOnline()) {
        const response = await fetch(fetchUrl);
        if (response.ok) {
          const serverData = await response.json();
          const items = Array.isArray(serverData) ? serverData : serverData.docs || serverData.tasks || [];
          
          setData(items);

          // Update local cache
          for (const item of items) {
            await setLocal(store, item);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load data"));
    } finally {
      setIsLoading(false);
    }
  }, [store, fetchUrl, enabled]);

  // Create with optimistic update
  const create = useCallback(
    async (item: Omit<T, "id"> & { id?: string }): Promise<T> => {
      const newItem = {
        ...item,
        id: item.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as T;

      // Optimistic update
      setData((prev) => [...prev, newItem]);

      // Save to local cache
      await setLocal(store, newItem);

      if (isOnline()) {
        try {
          const response = await fetch(fetchUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });

          if (response.ok) {
            const serverItem = await response.json();
            // Update with server response
            setData((prev) => prev.map((i) => (i.id === newItem.id ? serverItem : i)));
            await setLocal(store, serverItem);
            return serverItem;
          }
        } catch {
          // Queue for later sync
          await queueChange(store, "create", newItem);
          setHasPendingChanges(true);
        }
      } else {
        // Queue for later sync
        await queueChange(store, "create", newItem);
        setHasPendingChanges(true);
      }

      return newItem;
    },
    [store, fetchUrl]
  );

  // Update with optimistic update
  const update = useCallback(
    async (id: string, updates: Partial<T>): Promise<void> => {
      // Optimistic update
      setData((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, ...updates, updatedAt: new Date().toISOString() }
            : item
        )
      );

      // Get updated item
      const updatedItem = data.find((i) => i.id === id);
      if (updatedItem) {
        const merged = { ...updatedItem, ...updates, updatedAt: new Date().toISOString() };
        await setLocal(store, merged as T);

        if (isOnline()) {
          try {
            await fetch(`${fetchUrl}/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
          } catch {
            await queueChange(store, "update", { id, ...updates });
            setHasPendingChanges(true);
          }
        } else {
          await queueChange(store, "update", { id, ...updates });
          setHasPendingChanges(true);
        }
      }
    },
    [store, fetchUrl, data]
  );

  // Delete with optimistic update
  const remove = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update
      setData((prev) => prev.filter((item) => item.id !== id));

      // Remove from local cache
      await deleteLocal(store, id);

      if (isOnline()) {
        try {
          await fetch(`${fetchUrl}/${id}`, { method: "DELETE" });
        } catch {
          await queueChange(store, "delete", { id });
          setHasPendingChanges(true);
        }
      } else {
        await queueChange(store, "delete", { id });
        setHasPendingChanges(true);
      }
    },
    [store, fetchUrl]
  );

  // Sync pending changes
  const sync = useCallback(async (): Promise<void> => {
    if (syncingRef.current || !isOnline()) return;

    syncingRef.current = true;
    try {
      const result = await syncPendingChanges();
      if (result.synced > 0) {
        setHasPendingChanges(false);
        await loadData();
      }
      onSync?.(result.synced, result.failed);
    } finally {
      syncingRef.current = false;
    }
  }, [loadData, onSync]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for connectivity changes
  useEffect(() => {
    const unsubscribe = onConnectivityChange((online) => {
      setIsOffline(!online);
      if (online && hasPendingChanges) {
        sync();
      }
    });

    return unsubscribe;
  }, [hasPendingChanges, sync]);

  // Auto-sync when coming online
  useEffect(() => {
    if (!isOffline && hasPendingChanges) {
      sync();
    }
  }, [isOffline, hasPendingChanges, sync]);

  return {
    data,
    isLoading,
    error,
    isOffline,
    hasPendingChanges,
    create,
    update,
    remove,
    refresh: loadData,
    sync,
  };
}
