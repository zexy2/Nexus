"use client";

/**
 * Local-first write context.
 *
 * Optimistic, offline-capable writes need two things the list pages don't
 * otherwise track: the current userId (for createdBy/assigneeId) and the
 * workspaceId (for the optimistic row and the /api/sync/push authorization).
 *
 * workspaceId is resolved from the locally-synced workspaces store first (so it
 * works offline once cached), falling back to GET /api/workspace on first online
 * load. When the context isn't ready yet, callers fall back to the network write
 * path, so the UI never blocks on it.
 */
import { useEffect, useRef, useState } from "react";
import { useZero, type Workspace } from "@/lib/sync/zero";
import { useSession } from "@/lib/auth-client";

export function useLocalFirstContext() {
  const { engine } = useZero();
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const resolving = useRef(false);

  useEffect(() => {
    if (!engine || !userId || workspaceId) return;
    let cancelled = false;

    void (async () => {
      // 1) Prefer the workspace already cached locally (works offline).
      try {
        const cached = await engine.query<Workspace>("workspaces");
        const owned = cached.find((w) => w.ownerId === userId) ?? cached[0];
        if (owned) {
          if (!cancelled) setWorkspaceId(owned.id);
          return;
        }
      } catch {
        // fall through to the network
      }

      // 2) Resolve from the server (online only); cached on the next pull.
      if (resolving.current) return;
      resolving.current = true;
      try {
        const res = await fetch("/api/workspace");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.id) setWorkspaceId(data.id);
        }
      } catch {
        // Offline with no cached workspace: writes stay on the network path
        // until the first successful online load populates the store.
      } finally {
        resolving.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [engine, userId, workspaceId]);

  return { engine, userId, workspaceId, ready: Boolean(engine && userId && workspaceId) };
}
