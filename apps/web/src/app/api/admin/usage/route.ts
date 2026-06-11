import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { agentExecutions, auditLogs, rateLimitBuckets } from "@nexus/database/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAuditUsageSummary, isAdminEmail } from "@/lib/production-guardrails";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const summary = await getAuditUsageSummary();

  const [failedWorkflows] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentExecutions)
    .where(and(gte(agentExecutions.createdAt, since), eq(agentExecutions.status, "failed")));

  const activeBuckets = await db
    .select({
      key: rateLimitBuckets.key,
      bucket: rateLimitBuckets.bucket,
      count: rateLimitBuckets.count,
      limit: rateLimitBuckets.limit,
      resetAt: rateLimitBuckets.resetAt,
    })
    .from(rateLimitBuckets)
    .where(gte(rateLimitBuckets.resetAt, new Date()))
    .orderBy(desc(rateLimitBuckets.updatedAt))
    .limit(50);

  const recentAuditEvents = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(25);

  return NextResponse.json({
    ...summary,
    failedWorkflows24h: failedWorkflows?.count ?? 0,
    activeBuckets,
    recentAuditEvents,
    retention: {
      note: "For a long-running public demo, schedule cleanup for expired rate_limit_buckets and old audit_logs rows.",
      rateLimitBuckets: "delete where reset_at < now() - interval '7 days'",
      auditLogs: "retain 30-90 days depending on VPS storage",
    },
  });
}
