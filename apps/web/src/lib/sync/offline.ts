/**
 * Offline-First Data Layer
 * 
 * Provides optimistic UI updates and local caching using IndexedDB.
 * This is a simplified local-first implementation inspired by Zero Sync.
 */

const DB_NAME = "nexus-offline";
const DB_VERSION = 1;
const STORES = ["docs", "tasks", "pendingChanges"] as const;

type StoreName = (typeof STORES)[number];

interface PendingChange {
  id: string;
  store: StoreName;
  type: "create" | "update" | "delete";
  data: unknown;
  timestamp: number;
  synced: boolean;
}

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
export async function initOfflineDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Create stores if they don't exist
      for (const storeName of STORES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: "id" });
        }
      }
    };
  });
}

/**
 * Get item from local cache
 */
export async function getLocal<T>(store: StoreName, id: string): Promise<T | null> {
  const database = await initOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readonly");
    const objectStore = tx.objectStore(store);
    const request = objectStore.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from local cache
 */
export async function getAllLocal<T>(store: StoreName): Promise<T[]> {
  const database = await initOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readonly");
    const objectStore = tx.objectStore(store);
    const request = objectStore.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save item to local cache
 */
export async function setLocal<T extends { id: string }>(
  store: StoreName,
  data: T
): Promise<void> {
  const database = await initOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    const request = objectStore.put(data);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete item from local cache
 */
export async function deleteLocal(store: StoreName, id: string): Promise<void> {
  const database = await initOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Queue a change for later sync
 */
export async function queueChange(
  store: StoreName,
  type: PendingChange["type"],
  data: unknown
): Promise<string> {
  const change: PendingChange = {
    id: crypto.randomUUID(),
    store,
    type,
    data,
    timestamp: Date.now(),
    synced: false,
  };

  await setLocal("pendingChanges", change);
  return change.id;
}

/**
 * Get pending changes that need to be synced
 */
export async function getPendingChanges(): Promise<PendingChange[]> {
  const changes = await getAllLocal<PendingChange>("pendingChanges");
  return changes.filter((c) => !c.synced).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Mark a change as synced
 */
export async function markSynced(changeId: string): Promise<void> {
  const change = await getLocal<PendingChange>("pendingChanges", changeId);
  if (change) {
    change.synced = true;
    await setLocal("pendingChanges", change);
  }
}

/**
 * Sync pending changes to the server
 */
export async function syncPendingChanges(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingChanges();
  let synced = 0;
  let failed = 0;

  for (const change of pending) {
    try {
      const endpoint = `/api/${change.store}`;
      const data = change.data as Record<string, unknown>;

      switch (change.type) {
        case "create":
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          break;

        case "update":
          await fetch(`${endpoint}/${data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          break;

        case "delete":
          await fetch(`${endpoint}/${data.id}`, {
            method: "DELETE",
          });
          break;
      }

      await markSynced(change.id);
      synced++;
    } catch (error) {
      console.error("Sync failed for change:", change.id, error);
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

/**
 * Listen for online/offline events
 */
export function onConnectivityChange(
  callback: (online: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

/**
 * Clear all local data
 */
export async function clearLocalData(): Promise<void> {
  const database = await initOfflineDB();

  return new Promise((resolve, reject) => {
    const tx = database.transaction(STORES as unknown as string[], "readwrite");

    for (const store of STORES) {
      tx.objectStore(store).clear();
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
