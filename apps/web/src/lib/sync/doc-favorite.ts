import type { SyncEngine } from "./engine";

/**
 * Star/unstar a document (docs.is_favorite) through the sync engine, so the
 * change is applied locally at once, queued while offline, and pushed via
 * /api/sync/push (isFavorite is on the docs allowlist).
 *
 * The row must already be in the local cache: an update built from a partial
 * row would overwrite the cached doc with an incomplete copy.
 */
export async function setDocFavorite(
  engine: Pick<SyncEngine, "get" | "mutate">,
  docId: string,
  favorite: boolean
): Promise<void> {
  const existing = await engine.get<{ id: string } & Record<string, unknown>>("docs", docId);
  if (!existing) throw new Error("Document is not in the local cache yet");
  if (Boolean(existing.isFavorite) === favorite) return;
  await engine.mutate("docs", "update", { ...existing, isFavorite: favorite });
}
