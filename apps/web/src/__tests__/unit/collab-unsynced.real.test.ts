/**
 * Sign-out warning must count collaborative docs edited offline and then
 * closed: their edits live only in y-indexeddb, which sign-out deletes.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearPendingCollabDocs,
  countUnsyncedCollabDocs,
  listPendingCollabDocs,
  markCollabDocPendingSync,
  setCollabDocUnsynced,
  UNSYNCED_STORAGE_KEY,
} from "@/lib/collab/unsynced";
import { clearCollabOfflineData } from "@/lib/collab/offline-store";
import { signOutAndClearLocalData } from "@/lib/sync/sign-out";

beforeEach(() => {
  window.localStorage.clear();
  setCollabDocUnsynced("open-doc", false);
});

describe("persisted unsynced markers", () => {
  it("a doc edited offline stays counted after its editor closes", () => {
    // Editor mounted, local edit while offline.
    setCollabDocUnsynced("doc-1", true);
    markCollabDocPendingSync("user-1", "doc-1", true);
    expect(countUnsyncedCollabDocs("user-1")).toBe(1);

    // Editor unmounts (doc closed): live status cleared, marker persists.
    setCollabDocUnsynced("doc-1", false);
    expect(countUnsyncedCollabDocs("user-1")).toBe(1);
    expect(JSON.parse(window.localStorage.getItem(UNSYNCED_STORAGE_KEY)!)).toEqual(["user-1:doc-1"]);
  });

  it("is cleared once the server confirms the doc", () => {
    markCollabDocPendingSync("user-1", "doc-1", true);
    markCollabDocPendingSync("user-1", "doc-1", false);
    expect(countUnsyncedCollabDocs("user-1")).toBe(0);
    expect(window.localStorage.getItem(UNSYNCED_STORAGE_KEY)).toBeNull();
  });

  it("counts open and closed docs once each, scoped to the user", () => {
    setCollabDocUnsynced("doc-open", true);
    markCollabDocPendingSync("user-1", "doc-open", true);
    markCollabDocPendingSync("user-1", "doc-closed", true);
    markCollabDocPendingSync("user-2", "doc-other", true);
    expect(countUnsyncedCollabDocs("user-1")).toBe(2);
    expect(listPendingCollabDocs("user-2")).toEqual(["doc-other"]);
    setCollabDocUnsynced("doc-open", false);
  });

  it("is dropped together with the offline copies on sign-out cleanup", async () => {
    markCollabDocPendingSync("user-1", "doc-1", true);
    await clearCollabOfflineData();
    expect(countUnsyncedCollabDocs("user-1")).toBe(0);
  });

  it("ignores corrupt storage", () => {
    window.localStorage.setItem(UNSYNCED_STORAGE_KEY, "{oops");
    expect(countUnsyncedCollabDocs()).toBe(0);
    clearPendingCollabDocs();
  });
});

describe("signOutAndClearLocalData with a closed offline doc", () => {
  it("includes the closed doc in the warning and keeps data when the user stays", async () => {
    markCollabDocPendingSync("user-1", "doc-closed", true); // editor already closed
    const signOut = vi.fn().mockResolvedValue(undefined);
    const confirmDiscard = vi.fn().mockResolvedValue(false);
    const clearExtraLocalData = vi.fn().mockResolvedValue(undefined);

    const result = await signOutAndClearLocalData({
      engine: null,
      signOut,
      storage: null,
      countUnsyncedDocuments: () => countUnsyncedCollabDocs("user-1"),
      confirmDiscard,
      clearExtraLocalData,
    });

    expect(result).toBe("cancelled");
    expect(confirmDiscard).toHaveBeenCalledWith({ mutations: 0, documents: 1, total: 1 });
    expect(signOut).not.toHaveBeenCalled();
    expect(clearExtraLocalData).not.toHaveBeenCalled();
    expect(countUnsyncedCollabDocs("user-1")).toBe(1);
  });
});
