# ADR-002: Multi-Agent AI with LangGraph

## Status
**Accepted** - 18 Ocak 2026

## Context

Yapay zeka entegrasyonu için seçenekler değerlendirildi:

1. **Tek LLM çağrısı**: Basit ama sınırlı
2. **LangChain Chains**: DAG tabanlı, döngü yok
3. **CrewAI**: Agent takımları, ama az kontrol
4. **LangGraph**: State machine, döngüler, tam kontrol

## Decision

**LangGraph** ile Supervisor Pattern kullanarak çoklu ajan sistemi kuruyoruz.

## Rationale

### Neden LangGraph?

1. **Döngüsel Akışlar**: Agent hata yapınca geri dönüp düzeltebilir
2. **State Machine**: Her adım takip edilebilir
3. **Human-in-the-Loop**: Kritik işlemlerde insan onayı
4. **Conditional Routing**: Göreve göre doğru agent'a yönlendirme

### Supervisor Pattern

```
                    ┌─────────────┐
                    │  SUPERVISOR │
                    │   (Router)  │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌────────┐       ┌────────┐       ┌────────┐
    │Research│       │ Writer │       │ Coder  │
    │ Agent  │       │ Agent  │       │ Agent  │
    └────┬───┘       └────┬───┘       └────┬───┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │  SUPERVISOR │
                    │ (Synthesize)│
                    └─────────────┘
```

## Implementation

```typescript
// packages/agents/src/supervisor.ts
import { StateGraph, Annotation } from "@langchain/langgraph";

export const SupervisorState = Annotation.Root({
  messages: Annotation<any[]>({ reducer: (a, b) => [...a, ...b] }),
  currentAgent: Annotation<string | null>(),
  plan: Annotation<string[]>(),
  agentResults: Annotation<Record<string, AgentResult>>(),
});

const graph = new StateGraph(SupervisorState)
  .addNode("supervisor", supervisorNode)
  .addNode("research", researchNode)
  .addNode("writer", writerNode)
  .addNode("coder", coderNode)
  .addConditionalEdges("supervisor", routeNext)
  .addConditionalEdges("research", routeNext) // Döngü
  .addConditionalEdges("writer", routeNext)
  .compile();
```

## Trade-offs

| Avantaj                      | Dezavantaj               |
| ---------------------------- | ------------------------ |
| Karmaşık görevleri bölebilir | LangGraph öğrenme eğrisi |
| Self-correction mümkün       | Debug daha zor           |
| Human-in-loop desteği        | Token maliyeti artabilir |

## Consequences

### Pozitif
- "Araştır ve rapor yaz" gibi çok adımlı görevler çalışıyor
- Agent hata yapınca tekrar deneyebiliyor
- İzlenebilirlik (tracing) kolay

### Negatif
- LLM çağrı sayısı arttı
- State yönetimi karmaşıklaştı
