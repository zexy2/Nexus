/**
 * Admin AI usage report, built from the `ai_traces` table (one row per LLM
 * call, metadata only) and the live `rate_limit_buckets` counters.
 *
 * Windows: "today" is the current UTC calendar day; "7d" is the trailing
 * 7 x 24h. The global limits are rolling windows (see enforceAiBudget), so
 * their "used" numbers come from the rate-limit buckets, not from ai_traces.
 */
import { db } from "@/lib/db";
import { aiTraces, rateLimitBuckets, users } from "@nexus/database/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getAiUsageLimits } from "@/lib/production-guardrails";
import { estimateCostUsd, getModelPrices } from "@/lib/ai/model-prices";

const TOP_USERS = 10;

const calls = sql<number>`count(*)::int`;
const errors = sql<number>`(count(*) filter (where ${aiTraces.status} = 'error'))::int`;
const inputTokens = sql<number>`coalesce(sum(${aiTraces.inputTokens}), 0)::bigint`;
const outputTokens = sql<number>`coalesce(sum(${aiTraces.outputTokens}), 0)::bigint`;
const totalTokens = sql<number>`coalesce(sum(${aiTraces.totalTokens}), 0)::bigint`;
const avgLatency = sql<number>`coalesce(round(avg(${aiTraces.latencyMs})), 0)::int`;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function errorRate(errorCount: number, callCount: number): number {
  return callCount > 0 ? Math.round((errorCount / callCount) * 10_000) / 10_000 : 0;
}

/** postgres-js returns bigint aggregates as strings. */
const num = (value: unknown) => Number(value ?? 0);

async function windowReport(since: Date) {
  const where = gte(aiTraces.createdAt, since);
  const prices = getModelPrices();

  const [[totals], byAgentType, byModel] = await Promise.all([
    db
      .select({ calls, errors, inputTokens, outputTokens, totalTokens, avgLatencyMs: avgLatency })
      .from(aiTraces)
      .where(where),
    db
      .select({ agentType: aiTraces.agentType, calls, errors, totalTokens })
      .from(aiTraces)
      .where(where)
      .groupBy(aiTraces.agentType)
      .orderBy(desc(calls)),
    db
      .select({
        provider: aiTraces.provider,
        model: aiTraces.model,
        calls,
        errors,
        inputTokens,
        outputTokens,
        totalTokens,
        avgLatencyMs: avgLatency,
      })
      .from(aiTraces)
      .where(where)
      .groupBy(aiTraces.provider, aiTraces.model)
      .orderBy(desc(calls)),
  ]);

  const models = byModel.map((row) => {
    const input = num(row.inputTokens);
    const output = num(row.outputTokens);
    return {
      provider: row.provider ?? "unknown",
      model: row.model ?? "unknown",
      calls: row.calls,
      errors: row.errors,
      errorRate: errorRate(row.errors, row.calls),
      inputTokens: input,
      outputTokens: output,
      totalTokens: num(row.totalTokens),
      avgLatencyMs: row.avgLatencyMs,
      estimatedCostUsd: estimateCostUsd(prices, row.provider, row.model, input, output),
    };
  });

  const priced = models.filter((m) => m.estimatedCostUsd !== null);
  const callCount = totals?.calls ?? 0;
  const errorCount = totals?.errors ?? 0;

  return {
    since: since.toISOString(),
    calls: callCount,
    errors: errorCount,
    errorRate: errorRate(errorCount, callCount),
    inputTokens: num(totals?.inputTokens),
    outputTokens: num(totals?.outputTokens),
    totalTokens: num(totals?.totalTokens),
    avgLatencyMs: totals?.avgLatencyMs ?? 0,
    byAgentType: byAgentType.map((row) => ({
      agentType: row.agentType,
      calls: row.calls,
      errors: row.errors,
      errorRate: errorRate(row.errors, row.calls),
      totalTokens: num(row.totalTokens),
    })),
    byModel: models,
    estimatedCost: {
      usd: priced.reduce((sum, m) => sum + (m.estimatedCostUsd ?? 0), 0),
      /** Calls whose model has no configured price (excluded from `usd`). */
      unpricedCalls: models.filter((m) => m.estimatedCostUsd === null).reduce((sum, m) => sum + m.calls, 0),
    },
  };
}

export async function getAiUsageReport(now = new Date()) {
  const todayStart = startOfUtcDay(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const todayCalls = sql<number>`(count(*) filter (where ${aiTraces.createdAt} >= ${todayStart.toISOString()}::timestamptz))::int`;

  const [today, last7d, topUsers, globalBuckets] = await Promise.all([
    windowReport(todayStart),
    windowReport(weekStart),
    db
      .select({
        userId: aiTraces.userId,
        email: users.email,
        calls,
        callsToday: todayCalls,
        errors,
        totalTokens,
      })
      .from(aiTraces)
      .leftJoin(users, eq(users.id, aiTraces.userId))
      .where(gte(aiTraces.createdAt, weekStart))
      .groupBy(aiTraces.userId, users.email)
      .orderBy(desc(calls))
      .limit(TOP_USERS),
    db
      .select({ bucket: rateLimitBuckets.bucket, count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt })
      .from(rateLimitBuckets)
      .where(and(eq(rateLimitBuckets.key, "global"), gte(rateLimitBuckets.resetAt, now))),
  ]);

  const limits = getAiUsageLimits(false, false);
  const bucket = (name: string) => globalBuckets.find((b) => b.bucket === name);
  const dailyBucket = bucket("ai:daily");
  const minuteBucket = bucket("ai:minute");

  return {
    generatedAt: now.toISOString(),
    today,
    last7d,
    topUsers: topUsers.map((row) => ({
      userId: row.userId,
      email: row.email,
      calls: row.calls,
      callsToday: row.callsToday,
      errors: row.errors,
      totalTokens: num(row.totalTokens),
    })),
    limits: {
      globalDaily: {
        limit: limits.globalDaily,
        used: dailyBucket?.count ?? 0,
        resetAt: dailyBucket?.resetAt?.toISOString() ?? null,
      },
      globalMinute: {
        limit: limits.globalMinute,
        used: minuteBucket?.count ?? 0,
        resetAt: minuteBucket?.resetAt?.toISOString() ?? null,
      },
      perUser: {
        userDaily: limits.userDaily,
        userMinute: limits.userMinute,
        chatDaily: limits.chatDaily,
        workflowDaily: limits.workflowDaily,
      },
    },
    costEstimateConfigured: Object.keys(getModelPrices()).length > 0,
  };
}

export type AiUsageReport = Awaited<ReturnType<typeof getAiUsageReport>>;
