import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, rateLimitBuckets } from "@nexus/database/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

export type PersistentLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

function getRequestIP(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

function boolEnv(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function intEnv(name: string, defaultValue: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

export function isDemoMode() {
  return boolEnv("DEMO_MODE", process.env.NODE_ENV === "production");
}

export function isPublicSignupEnabled() {
  return boolEnv("PUBLIC_SIGNUP_ENABLED", process.env.NODE_ENV !== "production");
}

export function isAiEnabled() {
  return boolEnv("AI_ENABLED", true);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function getAiUsageLimits(isAdmin = false) {
  if (isAdmin) {
    return {
      globalDaily: intEnv("AI_GLOBAL_DAILY_LIMIT", 100),
      globalMinute: intEnv("AI_GLOBAL_PER_MINUTE_LIMIT", 4),
      userDaily: intEnv("AI_ADMIN_DAILY_LIMIT", 50),
      userMinute: intEnv("AI_ADMIN_PER_MINUTE_LIMIT", 4),
      workflowDaily: intEnv("AI_ADMIN_WORKFLOW_DAILY_LIMIT", 20),
      chatDaily: intEnv("AI_ADMIN_CHAT_DAILY_LIMIT", 100),
      maxStepsPerWorkflow: intEnv("AI_MAX_STEPS_PER_WORKFLOW", 8),
    };
  }

  return {
    globalDaily: intEnv("AI_GLOBAL_DAILY_LIMIT", 100),
    globalMinute: intEnv("AI_GLOBAL_PER_MINUTE_LIMIT", 4),
    userDaily: intEnv("AI_USER_DAILY_LIMIT", 5),
    userMinute: intEnv("AI_USER_PER_MINUTE_LIMIT", 2),
    workflowDaily: intEnv("AI_WORKFLOW_DAILY_LIMIT", 3),
    chatDaily: intEnv("AI_CHAT_DAILY_LIMIT", intEnv("AI_CHAT_MESSAGES_PER_DAY", 10)),
    maxStepsPerWorkflow: intEnv("AI_MAX_STEPS_PER_WORKFLOW", 5),
  };
}

export function getAiProviderStatus() {
  return {
    aiEnabled: isAiEnabled(),
    geminiAvailable: !!process.env.GEMINI_API_KEY,
    openaiAvailable: !!process.env.OPENAI_API_KEY,
    tavilyAvailable: !!process.env.TAVILY_API_KEY,
    primaryProvider: "gemini",
  };
}

export function aiUnavailableResponse(message = "AI is temporarily unavailable for this demo.") {
  return NextResponse.json(
    {
      error: "AI_PROVIDER_UNAVAILABLE",
      message,
      retryable: false,
    },
    { status: 503 }
  );
}

export function rateLimitResponse(result: PersistentLimitResult) {
  return NextResponse.json(
    {
      error: "RATE_LIMIT_EXCEEDED",
      limit: result.limit,
      remaining: 0,
      resetAt: result.resetAt,
    },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  );
}

export async function checkPersistentRateLimit(
  key: string,
  bucket: string,
  limit: number,
  windowMs: number
): Promise<PersistentLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const resetAtIso = resetAt.toISOString();

  const [row] = await db
    .insert(rateLimitBuckets)
    .values({
      key,
      bucket,
      count: 1,
      limit,
      resetAt,
    })
    .onConflictDoUpdate({
      target: [rateLimitBuckets.key, rateLimitBuckets.bucket],
      set: {
        count: sql<number>`case when ${rateLimitBuckets.resetAt} < now() then 1 else ${rateLimitBuckets.count} + 1 end`,
        limit,
        resetAt: sql<Date>`case when ${rateLimitBuckets.resetAt} < now() then ${resetAtIso}::timestamptz else ${rateLimitBuckets.resetAt} end`,
        updatedAt: now,
      },
    })
    .returning();

  const currentCount = row?.count ?? limit + 1;
  const currentReset = row?.resetAt?.getTime() ?? resetAt.getTime();

  return {
    allowed: currentCount <= limit,
    limit,
    remaining: Math.max(0, limit - currentCount),
    resetAt: currentReset,
  };
}

export async function enforceAiBudget(options: {
  userId: string;
  email?: string | null;
  kind: "chat" | "workflow" | "research" | "embedding";
}) {
  if (!isAiEnabled()) {
    return {
      ok: false as const,
      response: aiUnavailableResponse("AI is disabled for this demo right now."),
    };
  }

  if (!process.env.GEMINI_API_KEY && (options.kind === "chat" || options.kind === "workflow" || options.kind === "research")) {
    return {
      ok: false as const,
      response: aiUnavailableResponse("Gemini is not configured on this server."),
    };
  }

  const admin = isAdminEmail(options.email);
  const limits = getAiUsageLimits(admin);
  const oneDay = 24 * 60 * 60 * 1000;
  const oneMinute = 60 * 1000;

  const globalMinuteResult = await checkPersistentRateLimit("global", "ai:minute", limits.globalMinute, oneMinute);
  if (!globalMinuteResult.allowed) {
    await writeAuditLog({ userId: options.userId, event: "ai.limit_exceeded", status: "blocked", metadata: { scope: "global_minute", kind: options.kind } });
    return { ok: false as const, response: rateLimitResponse(globalMinuteResult) };
  }

  const userMinuteResult = await checkPersistentRateLimit(options.userId, "ai:user:minute", limits.userMinute, oneMinute);
  if (!userMinuteResult.allowed) {
    await writeAuditLog({ userId: options.userId, event: "ai.limit_exceeded", status: "blocked", metadata: { scope: "user_minute", kind: options.kind } });
    return { ok: false as const, response: rateLimitResponse(userMinuteResult) };
  }

  const globalResult = await checkPersistentRateLimit("global", "ai:daily", limits.globalDaily, oneDay);
  if (!globalResult.allowed) {
    await writeAuditLog({ userId: options.userId, event: "ai.limit_exceeded", status: "blocked", metadata: { scope: "global", kind: options.kind } });
    return { ok: false as const, response: rateLimitResponse(globalResult) };
  }

  const userResult = await checkPersistentRateLimit(options.userId, "ai:user:daily", limits.userDaily, oneDay);
  if (!userResult.allowed) {
    await writeAuditLog({ userId: options.userId, event: "ai.limit_exceeded", status: "blocked", metadata: { scope: "user", kind: options.kind } });
    return { ok: false as const, response: rateLimitResponse(userResult) };
  }

  const kindLimit =
    options.kind === "workflow"
      ? limits.workflowDaily
      : options.kind === "chat"
        ? limits.chatDaily
        : limits.userDaily;

  const kindResult = await checkPersistentRateLimit(options.userId, `ai:${options.kind}:daily`, kindLimit, oneDay);
  if (!kindResult.allowed) {
    await writeAuditLog({ userId: options.userId, event: "ai.limit_exceeded", status: "blocked", metadata: { scope: options.kind, kind: options.kind } });
    return { ok: false as const, response: rateLimitResponse(kindResult) };
  }

  return {
    ok: true as const,
    limits,
    remaining: {
      globalDaily: globalResult.remaining,
      userDaily: userResult.remaining,
      kindDaily: kindResult.remaining,
    },
  };
}

export async function getAiUsageRemaining(userId: string, email?: string | null) {
  const limits = getAiUsageLimits(isAdminEmail(email));
  const now = new Date();

  const rows = await db
    .select()
    .from(rateLimitBuckets)
    .where(
      and(
        gte(rateLimitBuckets.resetAt, now),
        inArray(rateLimitBuckets.key, [userId, "global"])
      )
    )
    .orderBy(desc(rateLimitBuckets.updatedAt));

  const countFor = (key: string, bucket: string) =>
    rows.find((row) => row.key === key && row.bucket === bucket)?.count ?? 0;

  return {
    globalDaily: Math.max(0, limits.globalDaily - countFor("global", "ai:daily")),
    userDaily: Math.max(0, limits.userDaily - countFor(userId, "ai:user:daily")),
    workflowsDaily: Math.max(0, limits.workflowDaily - countFor(userId, "ai:workflow:daily")),
    chatDaily: Math.max(0, limits.chatDaily - countFor(userId, "ai:chat:daily")),
  };
}

export async function writeAuditLog(input: {
  userId?: string | null;
  workspaceId?: string | null;
  event: string;
  status?: "success" | "failed" | "blocked";
  metadata?: Record<string, unknown>;
  request?: NextRequest;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId || null,
      workspaceId: input.workspaceId || null,
      event: input.event,
      status: input.status || "success",
      metadata: input.metadata,
      ipAddress: input.request ? getRequestIP(input.request) : undefined,
      userAgent: input.request?.headers.get("user-agent") || undefined,
    });
  } catch (error) {
    console.error("[Audit] Failed to write audit log:", error);
  }
}

export async function getAuditUsageSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [auditCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(gte(auditLogs.createdAt, since));

  const [blockedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(gte(auditLogs.createdAt, since), eq(auditLogs.status, "blocked")));

  return {
    auditEvents24h: auditCount?.count ?? 0,
    blockedEvents24h: blockedCount?.count ?? 0,
  };
}
