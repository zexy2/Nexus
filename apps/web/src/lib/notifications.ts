/**
 * Server-side in-app notifications.
 *
 * Rows are written from web-side status reconciliation (lib/workflow-reconcile)
 * rather than from workflow code: emitting from the workflow would add new
 * Temporal commands to executions already in flight. Reconciliation observes
 * each terminal transition exactly once (guarded UPDATE), and `dedupeKey` with
 * the (user_id, dedupe_key) unique index keeps emission idempotent anyway.
 *
 * Copy is not stored: the client renders `type` + `data` in the UI locale.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { agentExecutions, auditLogs, notifications, userSettings } from "@nexus/database/schema";
import { db } from "@/lib/db";

export type NotificationType =
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_cancelled"
  | "plan_review_pending";

export type NotificationRow = typeof notifications.$inferSelect;

type AgentExecutionRow = typeof agentExecutions.$inferSelect;

export const NOTIFICATION_LIST_LIMIT = 30;
/** Unread badge saturates here ("99+"); counting beyond it is wasted work. */
export const UNREAD_COUNT_CAP = 100;

function isUndefinedTable(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ??
    (error as { cause?: { code?: string } })?.cause?.code;
  return code === "42P01";
}

/**
 * Insert a notification once per (user, dedupeKey). Best-effort: a failure
 * here must never break the request that observed the transition.
 */
export async function createNotification(input: {
  userId: string;
  workspaceId?: string | null;
  type: NotificationType;
  data?: Record<string, unknown>;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, input.userId),
    });
    if (settings && settings.agentNotifications === false) return false;

    const inserted = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        type: input.type,
        data: input.data ?? {},
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning({ id: notifications.id });
    return inserted.length > 0;
  } catch (error) {
    // Before migration 0020 runs the table does not exist; stay silent.
    if (!isUndefinedTable(error)) {
      console.error("[Notifications] create failed:", error);
    }
    return false;
  }
}

/**
 * Who started a run. New rows carry `created_by`; rows started before
 * migration 0020 fall back to the `workflow.start` audit entry.
 */
export async function resolveExecutionOwner(
  execution: Pick<AgentExecutionRow, "id" | "createdBy">
): Promise<string | null> {
  if (execution.createdBy) return execution.createdBy;
  try {
    const [entry] = await db
      .select({ userId: auditLogs.userId })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.event, "workflow.start"),
          sql`${auditLogs.metadata}->>'executionId' = ${execution.id}`
        )
      )
      .limit(1);
    return entry?.userId ?? null;
  } catch {
    return null;
  }
}

export function workflowTypeOf(execution: Pick<AgentExecutionRow, "input">): string | null {
  const value = execution.input?.workflowType;
  return typeof value === "string" ? value : null;
}

export async function listNotifications(userId: string, limit = NOTIFICATION_LIST_LIMIT) {
  const [items, unread] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit,
    }),
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), isNull(notifications.readAt)),
      columns: { id: true },
      limit: UNREAD_COUNT_CAP,
    }),
  ]);
  return { items, unreadCount: unread.length };
}

/** Marks the caller's own notifications read; ids of other users are ignored. */
export async function markNotificationsRead(
  userId: string,
  target: { ids: string[] } | { all: true }
): Promise<number> {
  const scope = "all" in target
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : and(
        eq(notifications.userId, userId),
        inArray(notifications.id, target.ids),
        isNull(notifications.readAt)
      );
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(scope)
    .returning({ id: notifications.id });
  return updated.length;
}
