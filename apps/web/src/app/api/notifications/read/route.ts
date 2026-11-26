import { NextRequest, NextResponse } from "next/server";
import { protectRoute, RATE_LIMITS } from "@/lib/api-middleware";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

/**
 * POST /api/notifications/read — body `{ ids: string[] }` or `{ all: true }`.
 * Only the caller's own notifications are touched; foreign ids are ignored.
 */
export async function POST(request: NextRequest) {
  const protection = await protectRoute(request, {
    requireAuth: true,
    rateLimit: RATE_LIMITS.default,
  });
  if (!protection.success) return protection.response;
  if (!protection.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = protection.user.id;

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let updated: number;
  if (body?.all === true) {
    updated = await markNotificationsRead(userId, { all: true });
  } else if (Array.isArray(body?.ids)) {
    const ids = body.ids.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
    if (ids.length === 0 || ids.length > MAX_IDS || ids.length !== body.ids.length) {
      return NextResponse.json({ error: "ids must be 1-100 notification ids" }, { status: 400 });
    }
    updated = await markNotificationsRead(userId, { ids });
  } else {
    return NextResponse.json({ error: "Provide ids or all: true" }, { status: 400 });
  }

  const { unreadCount } = await listNotifications(userId, 1);
  return NextResponse.json({ updated, unreadCount });
}
