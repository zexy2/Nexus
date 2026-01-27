# ADR-004: Observability with OpenTelemetry

## Status
**Accepted** - 18 Ocak 2026

## Context

Dağıtık sistemlerde (Next.js + Temporal + AI Agents) izlenebilirlik kritik:

1. **Console.log**: Basit ama yetersiz
2. **Custom logging**: Manuel ve tutarsız
3. **OpenTelemetry**: Endüstri standardı, vendor-agnostic

## Decision

**OpenTelemetry** ile distributed tracing uyguluyoruz, **Jaeger** ile görselleştiriyoruz.

## Rationale

### Neden OpenTelemetry?

1. **Vendor Agnostic**: Jaeger, Zipkin, Datadog, vb. ile çalışır
2. **Auto-Instrumentation**: HTTP, DB çağrıları otomatik trace edilir
3. **Custom Spans**: Agent execution, LLM calls için özel span'lar
4. **Context Propagation**: Dağıtık sistemlerde trace ID takibi

### Trace Hierarchy

```
Trace: user-request-123
│
├── Span: api.workflows.POST
│   ├── Span: workflow.document
│   │   ├── Span: agent.research
│   │   │   └── Span: llm.call (gemini-2.5-flash)
│   │   ├── Span: agent.writer
│   │   │   └── Span: llm.call (gemini-2.5-flash)
│   │   └── Span: rag.embed
│   └── Span: temporal.start
```

## Implementation

```typescript
// apps/web/src/lib/otel.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

export function initTelemetry() {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: "nexus-web",
    }),
    traceExporter: new OTLPTraceExporter({
      url: "http://localhost:4318/v1/traces",
    }),
  });
  sdk.start();
}

// Custom trace helpers
export async function traceAgentExecution<T>(
  agentName: string,
  taskDescription: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(`agent.${agentName}`, fn, {
    "agent.name": agentName,
    "agent.task": taskDescription,
  });
}

export async function traceLLMCall<T>(
  model: string,
  prompt: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan("llm.call", fn, {
    "llm.model": model,
    "llm.prompt_length": prompt.length,
  });
}
```

## Trade-offs

| Avantaj               | Dezavantaj                |
| --------------------- | ------------------------- |
| End-to-end visibility | Küçük performans overhead |
| Industry standard     | Setup complexity          |
| Debug kolaylığı       | Ek storage gereksinimi    |

## Consequences

### Pozitif
- "Bu istek neden yavaş?" sorusuna anında cevap
- Agent'ların düşünce zinciri görselleştirilebiliyor
- Bottleneck'ler hemen tespit ediliyor

### Negatif
- Jaeger container'ı ek kaynak kullanıyor
- OTEL_ENABLED=true ayarı gerekli

## Viewing Traces

```bash
# Start Jaeger
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/jaeger:latest

# Enable telemetry
OTEL_ENABLED=true pnpm dev

# View traces
open http://localhost:16686
```
