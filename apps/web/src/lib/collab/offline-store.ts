/**
 * Offline persistence for collaborative document bodies (y-indexeddb).
 *
 * Each (user, document) pair gets its own IndexedDB database so a shared
 * browser profile never mixes users' local edits. Database names are recorded
 * in a localStorage registry so sign-out can delete them even on browsers
 * without `indexedDB.databases()`.
 */
import type * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { clearPendingCollabDocs } from "./unsynced";

export const COLLAB_OFFLINE_DB_PREFIX = "nexus-collab:";
const REGISTRY_KEY = "nexus-collab-offline-dbs";
const DELETE_TIMEOUT_MS = 3000;

const openStores = new Set<IndexeddbPersistence>();

export function collabOfflineDbName(userId: string, docId: string) {
  return `${COLLAB_OFFLINE_DB_PREFIX}${userId}:${docId}`;
}

function readRegistry(): string[] {
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeRegistry(names: string[]) {
  try {
    if (names.length === 0) window.localStorage.removeItem(REGISTRY_KEY);
    else window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(names));
  } catch {
    // Storage unavailable (private mode): the databases() fallback still works.
  }
}

/** Open (and register) the offline store for a document. */
export function openCollabOfflineStore(
  userId: string,
  docId: string,
  ydoc: Y.Doc
): IndexeddbPersistence | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  const name = collabOfflineDbName(userId, docId);
  const registry = readRegistry();
  if (!registry.includes(name)) writeRegistry([...registry, name]);
  try {
    const store = new IndexeddbPersistence(name, ydoc);
    openStores.add(store);
    store.on("destroy", () => openStores.delete(store));
    return store;
  } catch (error) {
    console.error("[Collab] Offline store unavailable:", error);
    return null;
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, DELETE_TIMEOUT_MS);
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = done;
      request.onerror = done;
    } catch {
      done();
    }
  });
}

/**
 * Delete every locally cached collaborative document (all users). Call on
 * sign-out. Open stores are closed first so the deletion is not blocked.
 */
export async function clearCollabOfflineData(): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;

  await Promise.all(
    Array.from(openStores, (store) => store.destroy().catch(() => undefined))
  );
  openStores.clear();

  const names = new Set(readRegistry());
  if (typeof indexedDB.databases === "function") {
    try {
      for (const info of await indexedDB.databases()) {
        if (info.name?.startsWith(COLLAB_OFFLINE_DB_PREFIX)) names.add(info.name);
      }
    } catch {
      // Fall back to the registry only.
    }
  }

  await Promise.all(Array.from(names, deleteDatabase));
  writeRegistry([]);
  // The offline copies are gone, so nothing is pending any more.
  clearPendingCollabDocs();
}
