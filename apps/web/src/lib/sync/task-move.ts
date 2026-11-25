/**
 * Persist a Kanban status change with exactly ONE server write.
 *
 * - Offline (and the task is cached): queue it through the sync engine
 *   (optimistic local update + one /api/sync/push later).
 * - Online: one REST PATCH. On success the local cache is updated from the
 *   server's answer with applyServerRow(), which does not queue a push. The
 *   previous code also called engine.mutate() here, which pushed the same
 *   (stale, whole-row) change a second time.
 */
import type { SyncEngine } from "./engine";
import type { Task as SyncTask } from "./zero";

export type TaskMoveResult = "queued" | "saved";

/** A rejected PATCH; `body` is the route's JSON error (e.g. AGENT_REVIEW_REQUIRED). */
export class TaskMoveError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

export async function persistTaskMove(options: {
  engine: Pick<SyncEngine, "get" | "mutate" | "applyServerRow"> | null;
  taskId: string;
  status: SyncTask["status"];
  online: boolean;
  fetchImpl?: typeof fetch;
}): Promise<TaskMoveResult> {
  const { engine, taskId, status, online } = options;
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));

  if (engine && !online) {
    const cached = await engine.get<SyncTask>("tasks", taskId);
    if (cached) {
      await engine.mutate<SyncTask>("tasks", "update", { ...cached, status });
      return "queued";
    }
  }

  const response = await fetchImpl(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new TaskMoveError(`Failed to move task: ${response.status}`, response.status, body);
  }

  if (engine) {
    const cached = await engine.get<SyncTask>("tasks", taskId);
    if (cached) {
      let updatedAt = cached.updatedAt;
      try {
        const body = (await response.json()) as { updatedAt?: string | number };
        const parsed = typeof body.updatedAt === "number" ? body.updatedAt : Date.parse(String(body.updatedAt));
        if (Number.isFinite(parsed)) updatedAt = parsed;
      } catch {
        // keep the cached timestamp; the next pull refreshes it
      }
      await engine.applyServerRow<SyncTask>("tasks", { ...cached, status, updatedAt });
    }
  }
  return "saved";
}
