/**
 * Which open collaborative documents have local edits the server has not
 * confirmed yet. Kept free of Yjs imports so the dashboard shell can read it
 * at sign-out without loading the editor bundle.
 *
 * Only mounted editors report here; edits made offline in a document that has
 * since been closed live only in its IndexedDB copy and are not counted.
 */
const unsyncedDocs = new Set<string>();

export function setCollabDocUnsynced(key: string, unsynced: boolean): void {
  if (unsynced) unsyncedDocs.add(key);
  else unsyncedDocs.delete(key);
}

export function countUnsyncedCollabDocs(): number {
  return unsyncedDocs.size;
}
