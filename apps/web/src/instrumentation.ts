/**
 * Next.js Instrumentation
 * 
 * This file is automatically loaded by Next.js to initialize
 * monitoring and observability tools before the application starts.
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Initialize OpenTelemetry if enabled
    if (process.env.OTEL_ENABLED === "true") {
      const { initTelemetry } = await import("./lib/otel");
      initTelemetry();
    }
  }
}
