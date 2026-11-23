"use client";

/**
 * Sign-out for everything the browser keeps per user: the sync engine's
 * IndexedDB (cache, queue, rejected store) and pull cursor, the offline
 * command queue DB, the persisted chat store and (via `clearExtraLocalData`)
 * the collaborative documents' offline copies.
 *
 * Order:
 *   1. Final sync while the session cookie is still valid.
 *   2. If changes are still unsynced, ask the user (`confirmDiscard`). If they
 *      choose to stay, nothing is signed out or deleted and a sync is retried.
 *   3. Sign out.
 *   4. Delete local data. This runs even when sign-out itself fails, so a
 *      shared machine never hands the next user a previous user's cache.
 */
import type { SyncEngine } from "./engine";
import { clearOfflineCommands } from "./offline-commands";

export const CHAT_STORE_KEY = "nexus-chat-store";

export interface UnsyncedChanges {
  /** Sync-engine mutations still queued after the final sync. */
  mutations: number;
  /** Open collaborative documents with edits the server has not confirmed. */
  documents: number;
  total: number;
}

export type SignOutResult = "signed-out" | "cancelled";

export async function signOutAndClearLocalData(options: {
  engine: SyncEngine | null;
  signOut: () => Promise<unknown>;
  storage?: Pick<Storage, "removeItem"> | null;
  /** Number of open documents with unconfirmed collaborative edits. */
  countUnsyncedDocuments?: () => number;
  /**
   * Called when changes are still unsynced after the final sync. Resolve
   * true to sign out anyway (the changes are lost), false to stay signed in.
   * Without it, sign-out proceeds (non-interactive callers).
   */
  confirmDiscard?: (unsynced: UnsyncedChanges) => Promise<boolean>;
  /** Extra per-user cleanup, e.g. collaborative documents' offline copies. */
  clearExtraLocalData?: () => Promise<void>;
}): Promise<SignOutResult> {
  const { engine, signOut, confirmDiscard, clearExtraLocalData } = options;
  const storage = options.storage !== undefined ? options.storage : typeof localStorage !== "undefined" ? localStorage : null;
  const liveEngine = engine && !engine.isDestroyed ? engine : null;

  if (liveEngine) {
    try {
      await liveEngine.flush();
    } catch {
      // best effort
    }
  }

  const mutations = liveEngine?.pendingCount ?? 0;
  let documents = 0;
  try {
    documents = options.countUnsyncedDocuments?.() ?? 0;
  } catch {
    documents = 0;
  }
  const unsynced: UnsyncedChanges = { mutations, documents, total: mutations + documents };

  if (unsynced.total > 0 && confirmDiscard) {
    const discard = await confirmDiscard(unsynced);
    if (!discard) {
      // Stay signed in and retry now (flush skips the push backoff).
      if (liveEngine) void liveEngine.flush().catch(() => undefined);
      return "cancelled";
    }
  }
  if (unsynced.total > 0) {
    console.warn(`[Sync] Signing out with ${unsynced.total} unsynced change(s); they are discarded.`);
  }

  try {
    await signOut();
  } finally {
    await Promise.allSettled([
      engine?.clearLocalData(),
      clearOfflineCommands(),
      clearExtraLocalData?.(),
    ]);
    try {
      storage?.removeItem(CHAT_STORE_KEY);
    } catch {
      // storage unavailable
    }
  }
  return "signed-out";
}
