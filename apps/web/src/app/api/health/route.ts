import { db } from "@/lib/db";
import { workerHeartbeats } from "@nexus/database/schema";
import { desc, sql } from "drizzle-orm";
import { getAiProviderStatus } from "@/lib/production-guardrails";
import { getIntegrationProviderConfig } from "@/lib/integrations/impact-graph";

// GET - Health check endpoint
export async function GET() {
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
      collaborationStatus === "healthy"
        ? "healthy"
        : "degraded";

    return Response.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
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
            githubIntegration.configured || linearIntegration.configured
              ? "partially_configured"
              : "not_configured",
          github: {
            configured: githubIntegration.configured,
            missing: githubIntegration.missing,
          },
          linear: {
            configured: linearIntegration.configured,
            missing: linearIntegration.missing,
          },
        },
      },
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return Response.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      },
      { status: 503 }
    );
  }
}
