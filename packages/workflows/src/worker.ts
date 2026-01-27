/**
 * Temporal Worker
 * 
 * Worker process that executes workflows and activities.
 * Run with: pnpm worker
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";
import path from "path";

async function run() {
  console.log("🚀 Starting Nexus Temporal Worker...");

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  // Use bundled workflow path from dist folder
  const workflowsPath = path.resolve(__dirname, "../dist/workflows.js");

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "nexus",
    taskQueue: "nexus-agents",
    workflowsPath: require.resolve("./workflows"),
    activities,
  });

  console.log("✅ Worker connected to Temporal");
  console.log("📋 Task Queue: nexus-agents");
  console.log("🔄 Waiting for workflows...\n");

  await worker.run();
}

run().catch((err) => {
  console.error("❌ Worker failed:", err);
  process.exit(1);
});
