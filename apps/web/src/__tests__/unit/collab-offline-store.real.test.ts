import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  clearCollabOfflineData,
  collabOfflineDbName,
  openCollabOfflineStore,
} from "@/lib/collab/offline-store";

async function databaseNames() {
  return (await indexedDB.databases()).map((db) => db.name);
}

describe("collab offline store", () => {
  it("keys stores per user and document", () => {
    expect(collabOfflineDbName("u1", "d1")).not.toBe(collabOfflineDbName("u2", "d1"));
  });

  it("indexeddb cleared on sign-out", async () => {
    const ydoc = new Y.Doc();
    const store = openCollabOfflineStore("user-1", "doc-1", ydoc)!;
    await store.whenSynced;
    ydoc.getText("t").insert(0, "offline edit");
    // Give y-indexeddb a moment to write the update.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // A second user's cached doc on the same machine.
    const other = openCollabOfflineStore("user-2", "doc-9", new Y.Doc())!;
    await other.whenSynced;
    await other.destroy();

    // Reopening restores the offline copy.
    const reopenedDoc = new Y.Doc();
    const reopened = openCollabOfflineStore("user-1", "doc-1", reopenedDoc)!;
    await reopened.whenSynced;
    expect(reopenedDoc.getText("t").toString()).toBe("offline edit");

    expect(await databaseNames()).toEqual(
      expect.arrayContaining([
        collabOfflineDbName("user-1", "doc-1"),
        collabOfflineDbName("user-2", "doc-9"),
      ])
    );

    // Sign-out: open stores are closed and every collab database is removed.
    await clearCollabOfflineData();

    const names = await databaseNames();
    expect(names.some((name) => name?.startsWith("nexus-collab:"))).toBe(false);
    expect(window.localStorage.getItem("nexus-collab-offline-dbs")).toBeNull();

    const freshDoc = new Y.Doc();
    const fresh = openCollabOfflineStore("user-1", "doc-1", freshDoc)!;
    await fresh.whenSynced;
    expect(freshDoc.getText("t").toString()).toBe("");
    await fresh.destroy();
  });
});
