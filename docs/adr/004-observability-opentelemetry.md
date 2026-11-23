# ADR-004: Optional OpenTelemetry instrumentation

## Status

**Partially implemented / optional.** Health checks, audit logs, request IDs, workflow IDs, and worker heartbeats are active. OpenTelemetry export is disabled unless configured.

## Decision

- Operational correctness does not depend on Jaeger.
- Set `OTEL_ENABLED=true` and an OTLP endpoint to export traces.
- The production compose file keeps Jaeger in the optional `ops` profile.
- Audit logs and workflow history remain the durable product trail; traces are diagnostic data.

## Consequences

- Documentation must not claim complete distributed tracing in deployments where `OTEL_ENABLED` is unset.
- Enabling the ops profile consumes additional VPS memory and should be deliberate on the free-tier host.

## Status update (2026-11)

OpenTelemetry instrumentation covers the **web app only** (`apps/web/src/instrumentation.ts`, enabled by `OTEL_ENABLED=true`). The Temporal worker and the collaboration server are not instrumented, so traces do not span workflow executions. Worker liveness is reported through the database heartbeat surfaced by `/api/health`.
