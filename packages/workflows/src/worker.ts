/**
 * Temporal Worker
 * 
 * Worker process that executes workflows and activities.
 * Run with: pnpm worker
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const taskQueue = process.env.TEMPORAL_TASK_QUEUE || "nexus-agents";
const workerId =
  process.env.WORKER_ID ||
  `nexus-worker-${typeof process.pid === "number" ? process.pid : Date.now()}`;

async function startWorkerHeartbeat() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("⚠️  DATABASE_URL not set; worker heartbeat disabled");
    return async () => {};
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1 });
  const intervalMs = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 30000);

  const beat = async (status: "healthy" | "stopped" = "healthy") => {
    try {
      await sql`
        INSERT INTO worker_heartbeats (worker_id, task_queue, status, last_heartbeat_at, metadata)
        VALUES (${workerId}, ${taskQueue}, ${status}, now(), ${JSON.stringify({
          pid: typeof process.pid === "number" ? process.pid : null,
          temporalAddress: process.env.TEMPORAL_ADDRESS || "localhost:7233",
          namespace: process.env.TEMPORAL_NAMESPACE || "default",
        })}::jsonb)
        ON CONFLICT (worker_id)
        DO UPDATE SET
          task_queue = excluded.task_queue,
          status = excluded.status,
          last_heartbeat_at = excluded.last_heartbeat_at,
          metadata = excluded.metadata,
          updated_at = now()
      `;
    } catch (error) {
      console.warn("⚠️  Worker heartbeat write failed:", error);
    }
  };

  await beat();
  const timer = setInterval(() => void beat(), intervalMs);

  return async () => {
    clearInterval(timer);
    await beat("stopped");
    await sql.end({ timeout: 3 });
  };
}

async function run() {
  console.log("🚀 Starting Nexus Temporal Worker...");

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    taskQueue,
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log("✅ Worker connected to Temporal");
  console.log(`📋 Task Queue: ${taskQueue}`);
  console.log("🔄 Waiting for workflows...\n");

  const stopHeartbeat = await startWorkerHeartbeat();
  const shutdown = async () => {
    await stopHeartbeat();
    process.exit(0);
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());

  await worker.run();
}

run().catch((err) => {
  console.error("❌ Worker failed:", err);
  process.exit(1);
});
