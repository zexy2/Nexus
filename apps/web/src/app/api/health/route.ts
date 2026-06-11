import { db } from "@/lib/db";
import { workerHeartbeats } from "@nexus/database/schema";
import { desc, sql } from "drizzle-orm";
import { getAiProviderStatus } from "@/lib/production-guardrails";

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
      await temporal.createTemporalClient();
      temporalLatency = Date.now() - temporalStart;
    } catch {
      temporalStatus = "unhealthy";
    }

    const ai = getAiProviderStatus();
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
      workerStatus === "healthy"
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
        ai: {
          status: ai.aiEnabled && ai.geminiAvailable ? "configured" : "unavailable",
          primaryProvider: ai.primaryProvider,
          geminiAvailable: ai.geminiAvailable,
          openaiAvailable: ai.openaiAvailable,
          tavilyAvailable: ai.tavilyAvailable,
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
