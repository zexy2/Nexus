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
