import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { agentExecutions } from "@nexus/database/schema";
import { db } from "@/lib/db";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { listNotifications, NOTIFICATION_LIST_LIMIT } from "@/lib/notifications";
import { reconcileRunningWorkflowExecutions } from "@/lib/workflow-reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bounded so one poll never fans out into many Temporal describes. */
const RECONCILE_LIMIT = 5;

/**
 * GET /api/notifications — the caller's notifications, newest first, plus the
 * unread count.
 *
 * Workflow completion is only observable by asking Temporal, so this poll
 * first reconciles the caller's own running runs; a terminal transition (or a
 * plan review becoming ready) writes the notification that is then listed.
 */
export async function GET(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.workflowStatus,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;

  try {
    const running = await db.query.agentExecutions.findMany({
      where: and(eq(agentExecutions.createdBy, userId), eq(agentExecutions.status, "running")),
      orderBy: [desc(agentExecutions.createdAt)],
      limit: RECONCILE_LIMIT,
    });
    if (running.length > 0) {
      await reconcileRunningWorkflowExecutions(running, { userId, request });
    }
  } catch (error) {
    // Listing must still work when reconciliation (Temporal) is unavailable.
    console.error("[Notifications] reconcile failed:", error);
  }

  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") || NOTIFICATION_LIST_LIMIT);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 100) : NOTIFICATION_LIST_LIMIT;

  const { items, unreadCount } = await listNotifications(userId, limit);
  return NextResponse.json(
    {
      notifications: items.map((item) => ({
        id: item.id,
        type: item.type,
        data: item.data,
        workspaceId: item.workspaceId,
        readAt: item.readAt,
        createdAt: item.createdAt,
      })),
      unreadCount,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
