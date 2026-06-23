import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLogs, rateLimitBuckets } from "@nexus/database/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getOllamaConfig, hasAnyLlmProvider, isLocalOnly } from "@/lib/ai/providers";
import { isEphemeralDemoEmail } from "@/lib/demo-sessions";
import { getTrustedProxyClientIP } from "@/lib/request-ip";

export type PersistentLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type PersistentLimitRequest = {
  key: string;
  bucket: string;
  limit: number;
  windowMs: number;
  scope: string;
};

type PersistentLimitBatchResult = PersistentLimitResult & {
  key: string;
  bucket: string;
  scope: string;
};

function getRequestIP(request: NextRequest) {
  return getTrustedProxyClientIP(request.headers);
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

export function isDemoEmail(email?: string | null) {
  if (!email || !isDemoMode()) return false;
  return (
    isEphemeralDemoEmail(email) ||
    email.toLowerCase() === (process.env.DEMO_EMAIL || "").trim().toLowerCase()
  );
}

export function getAiUsageLimits(isAdmin = false, isDemo = false) {
  if (isAdmin) {
    return {
      globalDaily: intEnv("AI_GLOBAL_DAILY_LIMIT", 40),
      globalMinute: intEnv("AI_GLOBAL_PER_MINUTE_LIMIT", 4),
      userDaily: intEnv("AI_ADMIN_DAILY_LIMIT", 50),
      userMinute: intEnv("AI_ADMIN_PER_MINUTE_LIMIT", 4),
      workflowDaily: intEnv("AI_ADMIN_WORKFLOW_DAILY_LIMIT", 20),
      chatDaily: intEnv("AI_ADMIN_CHAT_DAILY_LIMIT", 100),
      maxStepsPerWorkflow: intEnv("AI_MAX_STEPS_PER_WORKFLOW", 8),
    };
  }

  if (isDemo) {
    return {
      globalDaily: intEnv("AI_GLOBAL_DAILY_LIMIT", 40),
      globalMinute: intEnv("AI_GLOBAL_PER_MINUTE_LIMIT", 4),
      userDaily: intEnv("AI_DEMO_DAILY_LIMIT", 12),
      userMinute: intEnv("AI_DEMO_PER_MINUTE_LIMIT", 3),
      workflowDaily: intEnv("AI_DEMO_WORKFLOW_DAILY_LIMIT", 4),
      chatDaily: intEnv("AI_DEMO_CHAT_DAILY_LIMIT", 8),
      maxStepsPerWorkflow: intEnv("AI_MAX_STEPS_PER_WORKFLOW", 5),
    };
  }

  return {
    globalDaily: intEnv("AI_GLOBAL_DAILY_LIMIT", 40),
    globalMinute: intEnv("AI_GLOBAL_PER_MINUTE_LIMIT", 4),
    userDaily: intEnv("AI_USER_DAILY_LIMIT", 6),
    userMinute: intEnv("AI_USER_PER_MINUTE_LIMIT", 1),
    workflowDaily: intEnv("AI_WORKFLOW_DAILY_LIMIT", 2),
    chatDaily: intEnv("AI_CHAT_DAILY_LIMIT", intEnv("AI_CHAT_MESSAGES_PER_DAY", 4)),
    maxStepsPerWorkflow: intEnv("AI_MAX_STEPS_PER_WORKFLOW", 5),
  };
}

export function getAiProviderStatus() {
  const localOnly = isLocalOnly();
  return {
    aiEnabled: isAiEnabled(),
    geminiAvailable: !!process.env.GEMINI_API_KEY,
    openaiAvailable: !!process.env.OPENAI_API_KEY,
    tavilyAvailable: !!process.env.TAVILY_API_KEY,
    localAiAvailable: getOllamaConfig() !== null,
    localOnly,
    primaryProvider: localOnly ? "ollama" : "gemini",
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

async function consumePersistentRateLimits(
  requests: PersistentLimitRequest[]
): Promise<PersistentLimitBatchResult[]> {
  return db.transaction(async (tx) => {
    // All AI budgets share one short transaction lock. This makes checking and
    // consuming the global/user/kind buckets one atomic operation: a rejected
    // request cannot consume a different bucket on its way out.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('nexus-ai-budget'))`);

    const now = new Date();
    const current = await Promise.all(
      requests.map(async (request) => {
        const [row] = await tx
          .select()
          .from(rateLimitBuckets)
          .where(
            and(
              eq(rateLimitBuckets.key, request.key),
              eq(rateLimitBuckets.bucket, request.bucket)
            )
          )
          .limit(1);

        const active = row && row.resetAt.getTime() > now.getTime();
        return {
          request,
          count: active ? row.count : 0,
          resetAt: active
            ? row.resetAt
            : new Date(now.getTime() + request.windowMs),
        };
      })
    );

    const blocked = current.find(({ request, count }) => count >= request.limit);
    if (blocked) {
      return current.map(({ request, count, resetAt }) => ({
        key: request.key,
        bucket: request.bucket,
        scope: request.scope,
        allowed: count < request.limit,
        limit: request.limit,
        remaining: Math.max(0, request.limit - count),
        resetAt: resetAt.getTime(),
      }));
    }

    const consumed: PersistentLimitBatchResult[] = [];
    for (const { request, resetAt } of current) {
      const resetAtIso = resetAt.toISOString();
      const [row] = await tx
        .insert(rateLimitBuckets)
        .values({
          key: request.key,
          bucket: request.bucket,
          count: 1,
          limit: request.limit,
          resetAt,
        })
        .onConflictDoUpdate({
          target: [rateLimitBuckets.key, rateLimitBuckets.bucket],
          set: {
            count: sql<number>`case when ${rateLimitBuckets.resetAt} < now() then 1 else ${rateLimitBuckets.count} + 1 end`,
            limit: request.limit,
            resetAt: sql<Date>`case when ${rateLimitBuckets.resetAt} < now() then ${resetAtIso}::timestamptz else ${rateLimitBuckets.resetAt} end`,
            updatedAt: now,
          },
        })
        .returning();

      const count = row?.count ?? request.limit;
      consumed.push({
        key: request.key,
        bucket: request.bucket,
        scope: request.scope,
        allowed: count <= request.limit,
        limit: request.limit,
        remaining: Math.max(0, request.limit - count),
        resetAt: row?.resetAt.getTime() ?? resetAt.getTime(),
      });
    }

    return consumed;
  });
}

export async function enforceMutationBudget(options: {
  userId: string;
  email?: string | null;
  resource: "document" | "task";
}) {
  const minuteLimit = await checkPersistentRateLimit(
    options.userId,
    `mutation:${options.resource}:minute`,
    30,
    60 * 1000
  );
  if (!minuteLimit.allowed) return rateLimitResponse(minuteLimit);

  if (isDemoEmail(options.email)) {
    const dailyLimit = await checkPersistentRateLimit(
      options.userId,
      `mutation:${options.resource}:demo:daily`,
      100,
      24 * 60 * 60 * 1000
    );
    if (!dailyLimit.allowed) return rateLimitResponse(dailyLimit);
  }

  return null;
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

  // A chat/workflow/research turn needs an LLM — accept any configured provider,
  // including a local Ollama server (privacy mode), not just Gemini.
  if (!hasAnyLlmProvider() && (options.kind === "chat" || options.kind === "workflow" || options.kind === "research")) {
    return {
      ok: false as const,
      response: aiUnavailableResponse("No AI provider is configured on this server."),
    };
  }

  const admin = isAdminEmail(options.email);
  const limits = getAiUsageLimits(admin, isDemoEmail(options.email));
  const oneDay = 24 * 60 * 60 * 1000;
  const oneMinute = 60 * 1000;

  const kindLimit =
    options.kind === "workflow"
      ? limits.workflowDaily
      : options.kind === "chat"
        ? limits.chatDaily
        : limits.userDaily;

  const results = await consumePersistentRateLimits([
    { key: options.userId, bucket: `ai:${options.kind}:daily`, limit: kindLimit, windowMs: oneDay, scope: options.kind },
    { key: options.userId, bucket: "ai:user:minute", limit: limits.userMinute, windowMs: oneMinute, scope: "user_minute" },
    { key: options.userId, bucket: "ai:user:daily", limit: limits.userDaily, windowMs: oneDay, scope: "user" },
    { key: "global", bucket: "ai:minute", limit: limits.globalMinute, windowMs: oneMinute, scope: "global_minute" },
    { key: "global", bucket: "ai:daily", limit: limits.globalDaily, windowMs: oneDay, scope: "global" },
  ]);
  const blocked = results.find((result) => !result.allowed);
  if (blocked) {
    await writeAuditLog({
      userId: options.userId,
      event: "ai.limit_exceeded",
      status: "blocked",
      metadata: { scope: blocked.scope, kind: options.kind },
    });
    return { ok: false as const, response: rateLimitResponse(blocked) };
  }

  const resultFor = (key: string, bucket: string) =>
    results.find((result) => result.key === key && result.bucket === bucket)!;
  const globalResult = resultFor("global", "ai:daily");
  const userResult = resultFor(options.userId, "ai:user:daily");
  const kindResult = resultFor(options.userId, `ai:${options.kind}:daily`);

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
  const limits = getAiUsageLimits(isAdminEmail(email), isDemoEmail(email));
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
