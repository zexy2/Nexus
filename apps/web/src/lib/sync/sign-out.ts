"use client";

/**
 * Sign-out cleanup for everything the browser keeps per user: the sync
 * engine's IndexedDB (cache, queue, rejected store) and pull cursor, the
 * offline command queue DB, and the persisted chat store.
 *
 * Order: flush the sync queue while the session cookie is still valid, sign
 * out, then delete local data. Local data is deleted even when sign-out
 * itself fails, so a shared machine never hands the next user a previous
 * user's cache or queue.
 */
import type { SyncEngine } from "./engine";
import { clearOfflineCommands } from "./offline-commands";

export const CHAT_STORE_KEY = "nexus-chat-store";

export async function signOutAndClearLocalData(options: {
  engine: SyncEngine | null;
  signOut: () => Promise<unknown>;
  storage?: Pick<Storage, "removeItem"> | null;
}): Promise<void> {
  const { engine, signOut } = options;
  const storage = options.storage !== undefined ? options.storage : typeof localStorage !== "undefined" ? localStorage : null;

  if (engine && !engine.isDestroyed) {
    try {
      await engine.flush();
    } catch {
      // best effort
    }
    if (engine.pendingCount > 0) {
      console.warn(`[Sync] Signing out with ${engine.pendingCount} unsynced change(s); they are discarded.`);
    }
  }

  try {
    await signOut();
  } finally {
    await Promise.allSettled([engine?.clearLocalData(), clearOfflineCommands()]);
    try {
      storage?.removeItem(CHAT_STORE_KEY);
    } catch {
      // storage unavailable
    }
  }
}
