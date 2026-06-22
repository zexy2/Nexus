# Architecture Decision Records (ADR)

Bu klasör, Nexus projesindeki önemli mimari kararları belgelemektedir.

## ADR Listesi

| #                                         | Karar                                   | Durum          | Tarih        |
| ----------------------------------------- | --------------------------------------- | -------------- | ------------ |
| [001](001-local-first-architecture.md)    | Local-first data boundaries             | Superseded | 18 Ocak 2026 |
| [002](002-multi-agent-langgraph.md)       | AI orchestration and coding-agent boundary | Superseded | 18 Ocak 2026 |
| [003](003-durable-execution-temporal.md)  | Durable Execution with Temporal.io      | ✅ Kabul Edildi | 18 Ocak 2026 |
| [004](004-observability-opentelemetry.md) | Optional OpenTelemetry instrumentation  | Partial | 18 Ocak 2026 |

## ADR Nedir?

Architecture Decision Records (ADR), yazılım mimarisindeki önemli kararları belgelemek için kullanılan bir formattır. Her ADR şunları içerir:

- **Context**: Kararın verildiği bağlam
- **Decision**: Verilen karar
- **Rationale**: Kararın gerekçesi
- **Consequences**: Kararın olumlu ve olumsuz sonuçları

## ADR Template

Yeni bir ADR eklerken şu formatı kullanın:

```markdown
# ADR-XXX: [Başlık]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[Kararın verildiği bağlam]

## Decision
[Verilen karar]

## Rationale
[Kararın gerekçesi]

## Consequences
### Pozitif
- ...

### Negatif
- ...
```

## Referanslar

- [ADR GitHub Repository](https://github.com/joelparkerhenderson/architecture-decision-record)
- [Michael Nygard's ADR Article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
