"use client";

/**
 * Sign-out for everything the browser keeps per user: the sync engine's
 * IndexedDB (cache, queue, rejected store) and pull cursor, the offline
 * command queue DB, the persisted chat store and (via `clearExtraLocalData`)
 * the collaborative documents' offline copies.
 *
 * Order:
 *   1. Final sync while the session cookie is still valid.
 *   2. If anything would be lost, ask the user (`confirmDiscard`): queued
 *      mutations, collaborative edits, mutations kept in the rejected store
 *      (refused or parked after server errors) and offline AI commands the
 *      server has not taken over. If they choose to stay, nothing is signed
 *      out or deleted and a sync is retried.
 *   3. Sign out.
 *   4. Delete local data. This runs even when sign-out itself fails, so a
 *      shared machine never hands the next user a previous user's cache.
 */
import type { SyncEngine } from "./engine";
import { getBrowserStorage } from "./browser-storage";
import { clearOfflineCommands, countQueuedOfflineCommands } from "./offline-commands";

export const CHAT_STORE_KEY = "nexus-chat-store";

export interface UnsyncedChanges {
  /** Sync-engine mutations still queued after the final sync. */
  mutations: number;
  /**
   * Collaborative documents with edits the server has not confirmed: open
   * editors plus documents edited earlier and closed (their edits live only
   * in the y-indexeddb copy that sign-out deletes). See lib/collab/unsynced.ts.
   */
  documents: number;
  /**
   * Mutations in the engine's rejected store (refused by the server, or
   * parked after repeated server errors). Not queued any more, but still the
   * only copy of those edits.
   */
  rejected: number;
  /** Offline AI commands not yet accepted by the server (queued or failed). */
  commands: number;
  /** "Unsynced" changes: mutations + documents + commands. */
  unsynced: number;
  /** Everything sign-out would delete: unsynced + rejected. */
  total: number;
}

export type SignOutResult = "signed-out" | "cancelled";

export async function signOutAndClearLocalData(options: {
  engine: SyncEngine | null;
  signOut: () => Promise<unknown>;
  storage?: Pick<Storage, "removeItem"> | null;
  /** Number of documents (open or closed) with unconfirmed collaborative edits. */
  countUnsyncedDocuments?: () => number;
  /** Offline AI commands that would be lost (default: the command queue DB). */
  countQueuedCommands?: () => Promise<number>;
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
  const storage = options.storage !== undefined ? options.storage : getBrowserStorage();
  const liveEngine = engine && !engine.isDestroyed ? engine : null;

  if (liveEngine) {
    try {
      await liveEngine.flush();
    } catch {
      // best effort
    }
  }

  const mutations = liveEngine?.pendingCount ?? 0;
  const rejected = liveEngine?.rejectedCount ?? 0;
  let documents = 0;
  try {
    documents = options.countUnsyncedDocuments?.() ?? 0;
  } catch {
    documents = 0;
  }
  let commands = 0;
  try {
    commands = await (options.countQueuedCommands ?? countQueuedOfflineCommands)();
  } catch {
    commands = 0;
  }
  const unsyncedCount = mutations + documents + commands;
  const unsynced: UnsyncedChanges = {
    mutations,
    documents,
    rejected,
    commands,
    unsynced: unsyncedCount,
    total: unsyncedCount + rejected,
  };

  if (unsynced.total > 0 && confirmDiscard) {
    const discard = await confirmDiscard(unsynced);
    if (!discard) {
      // Stay signed in and retry now (flush skips the push backoff).
      if (liveEngine) void liveEngine.flush().catch(() => undefined);
      return "cancelled";
    }
  }
  if (unsynced.total > 0) {
    console.warn(
      `[Sync] Signing out with ${unsynced.unsynced} unsynced and ${unsynced.rejected} rejected change(s); they are discarded.`
    );
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
