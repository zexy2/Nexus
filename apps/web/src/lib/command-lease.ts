import { and, eq, inArray, sql } from "drizzle-orm";
import { agentExecutions } from "@nexus/database/schema";
import { db } from "@/lib/db";

/**
 * Lease for Ask Nexus commands, which run in-process after the HTTP response
 * (not on Temporal). While the run is alive it refreshes `heartbeat_at`; if the
 * process is recycled mid-run the heartbeat stops, and once it is older than
 * the TTL the row is marked failed (retryable) the next time anyone reads it.
 */
export const COMMAND_LEASE_TTL_MS = 5 * 60_000;
export const COMMAND_HEARTBEAT_INTERVAL_MS = 30_000;
export const COMMAND_LEASE_EXPIRED_ERROR =
  "COMMAND_LEASE_EXPIRED: the command stopped reporting progress (the server was likely restarted). Retry the command.";

type ExecutionRow = typeof agentExecutions.$inferSelect;

const LEASED_STATUSES = ["pending", "running"] as const;

export const COMMAND_WORKFLOW_ID_PREFIX = "cmd-";

export function isCommandExecution(row: Pick<ExecutionRow, "temporalWorkflowId">) {
  return Boolean(row.temporalWorkflowId?.startsWith(COMMAND_WORKFLOW_ID_PREFIX));
}

function leaseTimestamp(row: Pick<ExecutionRow, "heartbeatAt" | "startedAt" | "createdAt">) {
  return (row.heartbeatAt ?? row.startedAt ?? row.createdAt).getTime();
}

export function isCommandLeaseExpired(
  row: Pick<ExecutionRow, "status" | "temporalWorkflowId" | "heartbeatAt" | "startedAt" | "createdAt">,
  now = Date.now()
) {
  return (
    isCommandExecution(row) &&
    (LEASED_STATUSES as readonly string[]).includes(row.status) &&
    now - leaseTimestamp(row) > COMMAND_LEASE_TTL_MS
  );
}

/**
 * Marks a command execution failed if its lease has expired. The UPDATE
 * re-checks status and heartbeat, so a run that is still heartbeating (or has
 * just completed) is never overwritten. Returns the current row.
 */
export async function expireStaleCommandExecution<T extends ExecutionRow>(row: T, now = Date.now()): Promise<T> {
  if (!isCommandLeaseExpired(row, now)) return row;
  const cutoff = new Date(now - COMMAND_LEASE_TTL_MS).toISOString();
  const [expired] = await db
    .update(agentExecutions)
    .set({
      status: "failed",
      errorMessage: COMMAND_LEASE_EXPIRED_ERROR,
      completedAt: new Date(now),
    })
    .where(
      and(
        eq(agentExecutions.id, row.id),
        inArray(agentExecutions.status, [...LEASED_STATUSES]),
        sql`coalesce(${agentExecutions.heartbeatAt}, ${agentExecutions.startedAt}, ${agentExecutions.createdAt}) < ${cutoff}::timestamptz`
      )
    )
    .returning();
  if (expired) return { ...row, ...expired };
  const [current] = await db.select().from(agentExecutions).where(eq(agentExecutions.id, row.id)).limit(1);
  return current ? { ...row, ...current } : row;
}

export async function expireStaleCommandExecutions<T extends ExecutionRow>(rows: T[], now = Date.now()): Promise<T[]> {
  return Promise.all(rows.map((row) => expireStaleCommandExecution(row, now)));
}

/** Refreshes the lease while a command runs. Returns a stop function. */
export function startCommandHeartbeat(executionId: string, intervalMs = COMMAND_HEARTBEAT_INTERVAL_MS) {
  const timer = setInterval(() => {
    void db
      .update(agentExecutions)
      .set({ heartbeatAt: new Date() })
      .where(and(eq(agentExecutions.id, executionId), eq(agentExecutions.status, "running")))
      .catch((error: unknown) => {
        console.error(`[commands] Heartbeat for ${executionId} failed:`, error);
      });
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
