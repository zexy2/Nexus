import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

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

    const totalLatency = Date.now() - startTime;

    return Response.json({
      status: dbStatus === "healthy" ? "healthy" : "degraded",
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
