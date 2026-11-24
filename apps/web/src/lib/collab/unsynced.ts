/**
 * Which collaborative documents have local edits the server has not
 * confirmed yet. Kept free of Yjs imports so the dashboard shell can read it
 * at sign-out without loading the editor bundle.
 *
 * Two sources:
 *   - open editors report their live status (`setCollabDocUnsynced`);
 *   - a persisted marker per (user, doc) in localStorage, set as soon as a
 *     local update happens and cleared only when the server acknowledges a
 *     save or a resync. It survives closing the document (or the tab), so a
 *     doc edited offline and then closed still counts: its edits exist only in
 *     the y-indexeddb copy that sign-out deletes.
 */
export const UNSYNCED_STORAGE_KEY = "nexus-collab-unsynced";

const openUnsynced = new Set<string>();

type MarkerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): MarkerStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function markerKey(userId: string, docId: string) {
  return `${userId}:${docId}`;
}

function readMarkers(storage: MarkerStorage | null): string[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(UNSYNCED_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeMarkers(storage: MarkerStorage | null, markers: string[]) {
  if (!storage) return;
  try {
    if (markers.length === 0) storage.removeItem(UNSYNCED_STORAGE_KEY);
    else storage.setItem(UNSYNCED_STORAGE_KEY, JSON.stringify(markers));
  } catch {
    // Storage unavailable (private mode): only open editors are counted.
  }
}

/** Live status of a mounted editor (cleared when it unmounts). */
export function setCollabDocUnsynced(key: string, unsynced: boolean): void {
  if (unsynced) openUnsynced.add(key);
  else openUnsynced.delete(key);
}

/**
 * Persisted marker: `true` on a local edit, `false` once the server has
 * confirmed the document (persistence ack "saved" or a completed resync).
 * Never cleared just because the editor closed.
 */
export function markCollabDocPendingSync(
  userId: string,
  docId: string,
  pending: boolean,
  storage: MarkerStorage | null = defaultStorage()
): void {
  const key = markerKey(userId, docId);
  const markers = readMarkers(storage);
  const has = markers.includes(key);
  if (pending && !has) writeMarkers(storage, [...markers, key]);
  else if (!pending && has) writeMarkers(storage, markers.filter((m) => m !== key));
}

/** Persisted pending docs; `userId` limits them to one user. */
export function listPendingCollabDocs(
  userId?: string,
  storage: MarkerStorage | null = defaultStorage()
): string[] {
  const markers = readMarkers(storage);
  const scoped = userId ? markers.filter((m) => m.startsWith(`${userId}:`)) : markers;
  return scoped.map((m) => m.slice(m.indexOf(":") + 1));
}

/**
 * Distinct documents with unconfirmed edits: open editors plus documents
 * edited earlier (possibly closed) that the server never acknowledged.
 */
export function countUnsyncedCollabDocs(
  userId?: string,
  storage: MarkerStorage | null = defaultStorage()
): number {
  const docs = new Set(openUnsynced);
  for (const docId of listPendingCollabDocs(userId, storage)) docs.add(docId);
  return docs.size;
}

/** Drop all persisted markers (sign-out deletes the offline copies too). */
export function clearPendingCollabDocs(storage: MarkerStorage | null = defaultStorage()): void {
  writeMarkers(storage, []);
}
