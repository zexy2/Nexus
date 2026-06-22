# ADR-003: Durable Execution with Temporal.io

## Status
**Accepted** - 18 Ocak 2026

## Context

Uzun süren işlemler (AI araştırma, doküman oluşturma) için güvenilir yürütme gerekiyordu:

1. **Serverless Functions**: 60 saniye limit, state kaybı riski
2. **Background Jobs (BullMQ)**: Retry var ama state yönetimi manuel
3. **Temporal.io**: Durable execution, saga pattern, otomatik recovery

## Decision

**Temporal.io** kullanarak dayanıklı workflow'lar oluşturuyoruz.

## Rationale

### Neden Temporal?

1. **Durable Execution**: Sunucu çökse bile işlem kaldığı yerden devam eder
2. **Saga Pattern**: Hata durumunda compensation (geri alma) logic
3. **Long-Running Tasks**: Dakikalar, saatler, günler süren işlemler
4. **Visibility**: Temporal UI ile tüm workflow'ları izleyebilme

### Workflow vs Activity

```
┌─────────────────────────────────────────────────┐
│                   WORKFLOW                       │
│  (Durable, deterministic, orchestrator)         │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │Activity 1│───►│Activity 2│───►│Activity 3│  │
│  │ (Search) │    │ (Write)  │    │ (Index)  │  │
│  └──────────┘    └──────────┘    └──────────┘  │
│        │                                         │
│        ▼                                         │
│   Hata olursa ← Retry / Compensation            │
└─────────────────────────────────────────────────┘
```

## Implementation

```typescript
// packages/workflows/src/workflows.ts
import { proxyActivities } from "@temporalio/workflow";
import * as activities from "./activities";

const { searchWeb, generateDocument, indexDocument } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function documentGenerationWorkflow(input: DocumentInput) {
  // Step 1: Research
  const research = await searchWeb(input.topic);
  
  // Step 2: Generate document
  const document = await generateDocument(research, input);
  
  // Step 3: Index for search
  await indexDocument(document);
  
  return document;
}
```

## Trade-offs

| Avantaj                  | Dezavantaj                  |
| ------------------------ | --------------------------- |
| Guaranteed completion    | Temporal server gerekli     |
| Built-in retry & timeout | Öğrenme eğrisi              |
| Full visibility          | Ek altyapı maliyeti         |
| Saga pattern support     | Docker compose karmaşıklığı |

## Consequences

### Pozitif
- 5 dakikalık AI işlemleri güvenle çalışıyor
- Sunucu restart'ta işlem kaybolmuyor
- Temporal UI ile debug çok kolay

### Negatif
- Docker'da ek container'lar (temporal, temporal-ui)
- Worker process ayrı başlatılmalı

## Related Decisions
- ADR-001: Local-First Architecture
- ADR-002: AI orchestration and coding-agent boundary
