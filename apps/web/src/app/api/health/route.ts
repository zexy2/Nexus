import { db } from "@/lib/db";
import { externalWriteOperations, workerHeartbeats } from "@nexus/database/schema";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { getAiProviderStatus, isVerifiedAdminUser } from "@/lib/production-guardrails";
import { verifySession } from "@/lib/api-middleware";
import { getIntegrationProviderConfig } from "@/lib/integrations/impact-graph";

type IntegrationProviderName = "github" | "linear";

const INTEGRATION_PROVIDERS: IntegrationProviderName[] = ["github", "linear"];

function parseRequiredIntegrationProviders(): IntegrationProviderName[] {
  const explicitProviders = process.env.REQUIRE_INTEGRATION_PROVIDERS;

  if (explicitProviders !== undefined) {
    return explicitProviders
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider): provider is IntegrationProviderName =>
        INTEGRATION_PROVIDERS.includes(provider as IntegrationProviderName)
      );
  }

  // Backward compatibility: the old boolean meant "production should verify
  // integrations". Linear is still deferred, so GitHub is the only required
  // provider unless REQUIRE_INTEGRATION_PROVIDERS explicitly includes Linear.
  return process.env.REQUIRE_INTEGRATIONS_HEALTH === "true" ? ["github"] : [];
}

function tokenMatches(expected: string, provided: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Detailed health (latencies, configuration, missing env names, queue sizes,
 * environment, commit) is only for operators: requests carrying
 * HEALTH_CHECK_TOKEN (`Authorization: Bearer <token>` or `x-health-token`)
 * or a verified admin session. Everyone else gets per-service status only.
 */
async function canSeeDetails(request: Request): Promise<boolean> {
  const token = process.env.HEALTH_CHECK_TOKEN?.trim();
  if (token) {
    const authorization = request.headers.get("authorization") || "";
    const provided =
      request.headers.get("x-health-token") ||
      (authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "");
    if (provided && tokenMatches(token, provided)) return true;
  }
  // Only consult the session store when the caller sent cookies at all, so
  // unauthenticated probes stay cheap.
  if (!request.headers.get("cookie")) return false;
  const session = await verifySession();
  return session ? isVerifiedAdminUser(session.user.id, session.user.email) : false;
}

type DetailedHealth = {
  status: string;
  timestamp: string;
  services: Record<string, { status: string } & Record<string, unknown>>;
} & Record<string, unknown>;

/** Public view: overall + per-service status, no configuration or metrics. */
function toPublicHealth(health: DetailedHealth) {
  return {
    status: health.status,
    timestamp: health.timestamp,
    services: Object.fromEntries(
      Object.entries(health.services).map(([name, service]) => [name, { status: service.status }])
    ),
  };
}

// GET - Health check endpoint
export async function GET(request: Request) {
  const health = await collectHealth();
  const detailed = health.status !== "unhealthy" && (await canSeeDetails(request).catch(() => false));
  return Response.json(detailed ? health : toPublicHealth(health), {
    status: health.status === "unhealthy" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}

async function collectHealth(): Promise<DetailedHealth> {
  try {
    const startTime = Date.now();
    
    // Check database connectivity
    let dbStatus = "healthy";
    let dbLatency = 0;
    
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
    } catch {
      dbStatus = "unhealthy";
    }

    let temporalStatus = "healthy";
    let temporalLatency = 0;
    try {
      const temporalStart = Date.now();
      const temporal = await import("@nexus/workflows/client");
      await Promise.race([
        temporal.createTemporalClient(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Temporal health check timed out")),
            3000
          )
        ),
      ]);
      temporalLatency = Date.now() - temporalStart;
    } catch {
      temporalStatus = "unhealthy";
    }

    const ai = getAiProviderStatus();
    const githubIntegration = getIntegrationProviderConfig("github");
    const linearIntegration = getIntegrationProviderConfig("linear");
    const requiredIntegrationProviders = parseRequiredIntegrationProviders();
    const integrationsRequired = requiredIntegrationProviders.length > 0;
    const integrationConfigByProvider = {
      github: githubIntegration,
      linear: linearIntegration,
    } satisfies Record<IntegrationProviderName, typeof githubIntegration>;
    const requiredIntegrationsConfigured = requiredIntegrationProviders.every(
      (provider) => integrationConfigByProvider[provider].configured
    );
    const anyIntegrationConfigured =
      githubIntegration.configured || linearIntegration.configured;
    const externalWriteStaleAfterMinutes = 5;
    let externalWriteStatus: "healthy" | "stale" | "unavailable" = "unavailable";
    let pendingExternalWrites = 0;
    let staleExternalWrites = 0;

    if (dbStatus === "healthy") {
      try {
        const staleBefore = new Date(Date.now() - externalWriteStaleAfterMinutes * 60 * 1000);
        const [pending, stale] = await Promise.all([
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(externalWriteOperations)
            .where(
              or(
                inArray(externalWriteOperations.status, ["pending", "running", "failed_retryable"]),
                and(
                  eq(externalWriteOperations.status, "succeeded"),
                  inArray(externalWriteOperations.syncStatus, ["pending", "running", "failed_retryable"])
                )
              )
            ),
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(externalWriteOperations)
            .where(
              and(
                or(
                  inArray(externalWriteOperations.status, ["pending", "running", "failed_retryable"]),
                  and(
                    eq(externalWriteOperations.status, "succeeded"),
                    inArray(externalWriteOperations.syncStatus, ["pending", "running", "failed_retryable"])
                  )
                ),
                lt(externalWriteOperations.updatedAt, staleBefore)
              )
            ),
        ]);
        pendingExternalWrites = pending[0]?.count ?? 0;
        staleExternalWrites = stale[0]?.count ?? 0;
        externalWriteStatus = staleExternalWrites > 0 ? "stale" : "healthy";
      } catch {
        externalWriteStatus = "unavailable";
      }
    }
    const collaborationHealthUrl =
      process.env.COLLABORATION_HEALTH_URL || "http://localhost:1234";
    let collaborationStatus: "healthy" | "unavailable" = "unavailable";
    let collaborationPersistence:
      | "postgres"
      | "memory-only"
      | "unavailable" = "unavailable";
    let collaborationLatency = 0;

    try {
      const collaborationStart = Date.now();
      const response = await fetch(collaborationHealthUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      const payload = (await response.json()) as {
        persistence?: "postgres" | "memory-only" | "unavailable";
      };
      collaborationLatency = Date.now() - collaborationStart;
      collaborationPersistence = payload.persistence || "unavailable";
      collaborationStatus =
        response.ok && collaborationPersistence === "postgres"
          ? "healthy"
          : "unavailable";
    } catch {
      collaborationStatus = "unavailable";
      collaborationPersistence = "unavailable";
    }

    const heartbeatStaleAfterSeconds = Number(process.env.WORKER_HEARTBEAT_STALE_SECONDS || 90);
    let workerStatus: "healthy" | "stale" | "unknown" = "unknown";
    let lastHeartbeatAt: string | null = null;
    let secondsSinceHeartbeat: number | null = null;

    if (dbStatus === "healthy") {
      try {
        const [heartbeat] = await db
          .select()
          .from(workerHeartbeats)
          .orderBy(desc(workerHeartbeats.lastHeartbeatAt))
          .limit(1);

        if (heartbeat?.lastHeartbeatAt) {
          lastHeartbeatAt = heartbeat.lastHeartbeatAt.toISOString();
          secondsSinceHeartbeat = Math.floor(
            (Date.now() - heartbeat.lastHeartbeatAt.getTime()) / 1000
          );
          workerStatus =
            secondsSinceHeartbeat <= heartbeatStaleAfterSeconds
              ? "healthy"
              : "stale";
        }
      } catch {
        workerStatus = "unknown";
      }
    }

    const totalLatency = Date.now() - startTime;
    const overallStatus =
      dbStatus === "healthy" &&
      temporalStatus === "healthy" &&
      workerStatus === "healthy" &&
      collaborationStatus === "healthy" &&
      externalWriteStatus !== "stale" &&
      (!integrationsRequired || requiredIntegrationsConfigured)
        ? "healthy"
        : "degraded";

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      commitSha: process.env.APP_COMMIT_SHA || "unknown",
      services: {
        database: {
          status: dbStatus,
          latency: dbLatency,
        },
        api: {
          status: "healthy",
          latency: totalLatency,
        },
        temporal: {
          status: temporalStatus,
          latency: temporalLatency,
          namespace: process.env.TEMPORAL_NAMESPACE || "default",
        },
        worker: {
          status: workerStatus,
          taskQueue: process.env.TEMPORAL_TASK_QUEUE || "nexus-agents",
          lastHeartbeatAt,
          secondsSinceHeartbeat,
          staleAfterSeconds: heartbeatStaleAfterSeconds,
        },
        collaboration: {
          status: collaborationStatus,
          persistence: collaborationPersistence,
          latency: collaborationLatency,
        },
        ai: {
          status: ai.aiEnabled && ai.geminiAvailable ? "configured" : "unavailable",
          primaryProvider: ai.primaryProvider,
          geminiAvailable: ai.geminiAvailable,
          openaiAvailable: ai.openaiAvailable,
          tavilyAvailable: ai.tavilyAvailable,
        },
        integrations: {
          status:
            integrationsRequired && requiredIntegrationsConfigured
              ? "configured"
              : !integrationsRequired && anyIntegrationConfigured
              ? "configured"
              : anyIntegrationConfigured
              ? "partially_configured"
              : "not_configured",
          required: integrationsRequired,
          requiredProviders: requiredIntegrationProviders,
          github: {
            configured: githubIntegration.configured,
            missing: githubIntegration.missing,
            required: requiredIntegrationProviders.includes("github"),
          },
          linear: {
            configured: linearIntegration.configured,
            missing: linearIntegration.missing,
            required: requiredIntegrationProviders.includes("linear"),
            deferred: !requiredIntegrationProviders.includes("linear"),
          },
          externalWrites: {
            status: externalWriteStatus,
            pending: pendingExternalWrites,
            stale: staleExternalWrites,
            staleAfterMinutes: externalWriteStaleAfterMinutes,
          },
        },
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };
  } catch (error) {
    console.error("Health check failed:", error);
    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      services: {},
      error: "Health check failed",
    };
  }
}
