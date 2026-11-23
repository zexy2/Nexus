/**
 * OpenTelemetry Configuration
 * 
 * Provides distributed tracing and observability for the Nexus platform.
 * Tracks API calls, durable workflows, and system performance.
 * 
 * Setup:
 * 1. Run Jaeger: docker run -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:latest
 * 2. Set OTEL_ENABLED=true in .env.local
 * 3. Open http://localhost:16686 to view traces
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { 
  SEMRESATTRS_SERVICE_NAME, 
  SEMRESATTRS_SERVICE_VERSION, 
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT 
} from "@opentelemetry/semantic-conventions";

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "nexus-web";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK
 */
export function initTelemetry(): void {
  // Check if we should enable telemetry
  if (process.env.OTEL_ENABLED !== "true") {
    console.log("[OpenTelemetry] Disabled (set OTEL_ENABLED=true to enable)");
    return;
  }

  if (sdk) {
    console.log("[OpenTelemetry] Already initialized");
    return;
  }

  try {
    const traceExporter = new OTLPTraceExporter({
      url: OTEL_ENDPOINT,
    });

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
        [SEMRESATTRS_SERVICE_VERSION]: "0.1.0",
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "development",
      }),
      traceExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable some noisy instrumentations
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });

    sdk.start();
    
    console.log(`[OpenTelemetry] ✅ Initialized`);
    console.log(`[OpenTelemetry] Exporting to: ${OTEL_ENDPOINT}`);
    console.log(`[OpenTelemetry] Service: ${SERVICE_NAME}`);
    console.log(`[OpenTelemetry] View traces at: http://localhost:16686`);
  } catch (error) {
    console.error("[OpenTelemetry] Failed to initialize:", error);
  }
}
